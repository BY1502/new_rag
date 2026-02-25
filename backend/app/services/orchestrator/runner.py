"""
오케스트레이터 실행기
asyncio.Queue로 LangGraph 노드의 SSE 이벤트를 실시간 전달
"""
import asyncio
import json
import logging
from typing import AsyncGenerator, Optional, List, Any

logger = logging.getLogger(__name__)

# 그래프 싱글턴 (모듈 레벨 컴파일)
_compiled_graph = None


def _get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        from .graph import build_graph
        _compiled_graph = build_graph()
        logger.info("[Orchestrator] LangGraph compiled successfully")
    return _compiled_graph


async def run_orchestrator(
    message: str,
    kb_ids: List[str],
    user_id: int,
    llm: Any,
    model: str,
    system_prompt: Optional[str] = None,
    history: Optional[List[dict]] = None,
    use_deep_think: bool = False,
    use_web_search: bool = False,
    top_k: int = 5,
    use_rerank: bool = False,
    search_provider: Optional[str] = None,
    search_mode: str = "hybrid",
    dense_weight: float = 0.5,
    images: Optional[List[str]] = None,
    use_sql: bool = False,
    db_connection_id: Optional[str] = None,
    use_multimodal_search: bool = False,
    active_mcp_ids: Optional[List[str]] = None,
    db: Any = None,
) -> AsyncGenerator[str, None]:
    """
    멀티 에이전트 오케스트레이터 실행.
    asyncio.Queue를 통해 각 노드의 SSE 이벤트를 실시간으로 yield.
    기존 generate_response()와 동일한 JSON line 포맷 출력.
    """
    queue: asyncio.Queue = asyncio.Queue()

    initial_state = {
        # Input
        "message": message,
        "kb_ids": kb_ids,
        "user_id": user_id,
        "model": model,
        "system_prompt": system_prompt,
        "history": history,
        "llm": llm,
        "db": db,
        # Config
        "use_deep_think": use_deep_think,
        "use_web_search": use_web_search,
        "top_k": top_k,
        "use_rerank": use_rerank,
        "search_provider": search_provider,
        "search_mode": search_mode,
        "dense_weight": dense_weight,
        "images": images,
        "use_sql": use_sql,
        "db_connection_id": db_connection_id,
        "use_multimodal_search": use_multimodal_search,
        "active_mcp_ids": active_mcp_ids or [],
        # Routing (초기값)
        "planned_agents": [],
        "short_circuit": None,
        "current_step": 0,
        # Accumulation (초기값)
        "agent_results": [],
        "tool_calls_log": [],
        # Streaming
        "sse_queue": queue,
    }

    graph = _get_graph()

    async def _run_graph():
        """백그라운드 태스크에서 그래프 실행"""
        try:
            await graph.ainvoke(initial_state)
        except Exception as e:
            logger.error(f"[Orchestrator] Graph execution error: {e}", exc_info=True)
            try:
                await queue.put({
                    "type": "content",
                    "content": f"멀티 에이전트 오케스트레이터 오류: {str(e)}",
                })
            except Exception:
                pass
        finally:
            # sentinel을 보장 (노드에서 이미 보냈더라도 중복 처리 안전)
            try:
                await queue.put(None)
            except Exception:
                pass

    task = asyncio.create_task(_run_graph())

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=300)
            except asyncio.TimeoutError:
                logger.warning("[Orchestrator] Queue timeout (5min)")
                yield json.dumps({
                    "type": "content",
                    "content": "응답 시간이 초과되었습니다.",
                }) + "\n"
                break

            if event is None:
                break

            yield json.dumps(event) + "\n"
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
