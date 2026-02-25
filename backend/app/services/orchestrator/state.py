"""
오케스트레이터 상태 정의
LangGraph StateGraph에서 노드 간 전달되는 공유 상태
"""
from typing import TypedDict, List, Optional, Any


class OrchestratorState(TypedDict):
    # ── Input (그래프 진입 시 설정) ──
    message: str
    kb_ids: List[str]
    user_id: int
    model: str
    system_prompt: Optional[str]
    history: Optional[List[dict]]
    llm: Any                            # LLM 인스턴스 (직렬화 불필요)
    db: Any                             # AsyncSession

    # ── Config (요청 파라미터) ──
    use_deep_think: bool
    use_web_search: bool
    top_k: int
    use_rerank: bool
    search_provider: Optional[str]
    search_mode: str
    dense_weight: float
    images: Optional[List[str]]
    use_sql: bool
    db_connection_id: Optional[str]
    use_multimodal_search: bool
    active_mcp_ids: List[str]

    # ── Routing (Supervisor 출력) ──
    planned_agents: List[str]           # ["rag", "web_search"] 등
    short_circuit: Optional[str]        # "t2sql" | "process" | None
    current_step: int                   # 현재 실행 중인 에이전트 인덱스

    # ── Accumulation (에이전트 출력 누적) ──
    agent_results: List[dict]           # [{"agent": str, "context": str, "duration_ms": int}]
    tool_calls_log: List[dict]          # [{"name": str, "input": dict, "output": str, "duration_ms": int}]

    # ── Streaming ──
    sse_queue: Any                      # asyncio.Queue — 노드에서 SSE 이벤트 푸시
