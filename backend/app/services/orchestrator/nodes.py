"""
오케스트레이터 그래프 노드
각 노드는 기존 RAGService 메서드를 래핑하여 LangGraph 노드로 동작
"""
import json
import time
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def _emit(state: dict, event: dict):
    """SSE 이벤트를 큐에 푸시"""
    if state.get("sse_queue") and event is not None:
        await state["sse_queue"].put(event)


async def _emit_sentinel(state: dict):
    """스트림 종료 시그널"""
    if state.get("sse_queue"):
        await state["sse_queue"].put(None)


# ─────────────────────────────────────────────────────
# SUPERVISOR NODE: 의도 분석 + 에이전트 실행 계획 수립
# ─────────────────────────────────────────────────────
async def supervisor_node(state: dict) -> dict:
    """사용자 질의를 분석하고 전문 에이전트 실행 계획을 수립"""
    from app.services.rag_service import get_rag_service

    await _emit(state, {
        "type": "thinking",
        "thinking": "🧠 Supervisor: 질의 의도를 분석합니다...",
        "active_agent": "supervisor",
    })

    # 1. T2SQL short-circuit
    if state.get("use_sql") and state.get("db_connection_id"):
        await _emit(state, {
            "type": "thinking",
            "thinking": "🧠 Supervisor: T2SQL 에이전트로 라우팅합니다.",
            "active_agent": "supervisor",
        })
        return {"short_circuit": "t2sql", "planned_agents": [], "current_step": 0}

    # 2. 기존 _analyze_intent로 도구 결정
    rag_service = get_rag_service()
    tools = await rag_service._analyze_intent(
        state["message"], state["llm"],
        state.get("use_web_search", False),
        state.get("use_deep_think", False),
        state.get("use_rag", True),
    )
    logger.info(f"[Orchestrator] Supervisor: tools={tools}")

    # 3. Process short-circuit
    if tools == ["process"]:
        await _emit(state, {
            "type": "thinking",
            "thinking": "🧠 Supervisor: 물류 에이전트(xLAM)로 라우팅합니다.",
            "active_agent": "supervisor",
        })
        return {"short_circuit": "process", "planned_agents": [], "current_step": 0}

    # 4. 일반 에이전트 계획 수립
    planned = []

    # MCP 도구가 활성화되어 있으면 MCP 에이전트 추가
    if state.get("active_mcp_ids"):
        planned.append("mcp")

    for t in tools:
        if t in ("rag", "web_search") and t not in planned:
            planned.append(t)

    # plan이 비어있으면 기본 RAG
    if not planned:
        planned = ["rag"]

    agent_labels = {
        "rag": "📚 RAG", "web_search": "🌐 웹검색",
        "mcp": "🔌 MCP", "t2sql": "🗄️ SQL", "process": "⚙️ 물류",
    }
    plan_display = " → ".join(agent_labels.get(a, a) for a in planned)

    await _emit(state, {
        "type": "thinking",
        "thinking": f"🧠 Supervisor: 실행 계획 [{plan_display}]",
        "active_agent": "supervisor",
    })

    # 파이프라인 시각화용 이벤트
    await _emit(state, {
        "type": "pipeline_plan",
        "agents": ["supervisor"] + planned + ["synthesizer"],
    })
    await _emit(state, {
        "type": "agent_status", "agent": "supervisor", "status": "done", "duration_ms": 0,
    })

    return {"planned_agents": planned, "short_circuit": None, "current_step": 0}


# ─────────────────────────────────────────────────────
# RAG AGENT NODE: 벡터 검색 + 지식 그래프
# ─────────────────────────────────────────────────────
async def rag_agent_node(state: dict) -> dict:
    """지식 베이스에서 관련 문서를 검색"""
    from app.services.rag_service import get_rag_service

    await _emit(state, {
        "type": "thinking",
        "thinking": "📚 RAG Agent: 지식 베이스에서 문서를 검색합니다...",
        "active_agent": "rag",
    })
    await _emit(state, {"type": "agent_status", "agent": "rag", "status": "active"})

    t0 = time.time()
    rag_service = get_rag_service()

    sources = []
    try:
        context, sources = await rag_service._retrieve_context(
            state["message"],
            state["kb_ids"],
            state["user_id"],
            top_k=state.get("top_k", 5),
            use_rerank=state.get("use_rerank", False),
            search_mode=state.get("search_mode", "hybrid"),
            dense_weight=state.get("dense_weight", 0.5),
            use_multimodal_search=state.get("use_multimodal_search", False),
            db=state.get("db"),
        )
    except Exception as e:
        logger.error(f"[Orchestrator] RAG agent error: {e}")
        context = ""

    duration = int((time.time() - t0) * 1000)

    result = {"agent": "rag", "context": context or "", "sources": sources, "duration_ms": duration}
    tool_call = {
        "name": "vector_retrieval",
        "input": {"query": state["message"], "kb_ids": state["kb_ids"]},
        "output": (context or "")[:500],
        "duration_ms": duration,
    }

    await _emit(state, {
        "type": "thinking",
        "thinking": f"📚 RAG Agent: 검색 완료 ({duration}ms)",
        "active_agent": "rag",
    })
    await _emit(state, {"type": "agent_status", "agent": "rag", "status": "done", "duration_ms": duration})

    return {
        "agent_results": state.get("agent_results", []) + [result],
        "tool_calls_log": state.get("tool_calls_log", []) + [tool_call],
        "current_step": state.get("current_step", 0) + 1,
    }


# ─────────────────────────────────────────────────────
# WEB SEARCH AGENT NODE: 웹 검색
# ─────────────────────────────────────────────────────
async def web_search_agent_node(state: dict) -> dict:
    """인터넷에서 최신 정보를 검색"""
    from app.services.rag_service import get_rag_service

    provider = state.get("search_provider") or "ddg"
    provider_labels = {
        "ddg": "DuckDuckGo", "serper": "Google Serper",
        "brave": "Brave Search", "tavily": "Tavily",
    }

    await _emit(state, {
        "type": "thinking",
        "thinking": f"🌐 Web Agent: {provider_labels.get(provider, provider)} 검색 중...",
        "active_agent": "web_search",
    })
    await _emit(state, {"type": "agent_status", "agent": "web_search", "status": "active"})

    t0 = time.time()
    rag_service = get_rag_service()

    try:
        web_ctx = await rag_service._web_search(
            state["message"], provider, state["user_id"]
        )
    except Exception as e:
        logger.error(f"[Orchestrator] Web search error: {e}")
        web_ctx = ""

    duration = int((time.time() - t0) * 1000)

    is_success = bool(web_ctx) and not web_ctx.startswith("[Web Search Failed]")
    result = {
        "agent": "web_search",
        "context": web_ctx if is_success else "",
        "duration_ms": duration,
    }
    tool_call = {
        "name": "web_search",
        "input": {"query": state["message"], "provider": provider},
        "output": (web_ctx or "")[:500],
        "duration_ms": duration,
    }

    status_msg = f"검색 완료 ({duration}ms)" if is_success else "검색 실패"
    await _emit(state, {
        "type": "thinking",
        "thinking": f"🌐 Web Agent: {status_msg}",
        "active_agent": "web_search",
    })
    await _emit(state, {"type": "agent_status", "agent": "web_search", "status": "done", "duration_ms": duration})

    return {
        "agent_results": state.get("agent_results", []) + [result],
        "tool_calls_log": state.get("tool_calls_log", []) + [tool_call],
        "current_step": state.get("current_step", 0) + 1,
    }


# ─────────────────────────────────────────────────────
# MCP AGENT NODE: MCP 도구 실행
# ─────────────────────────────────────────────────────
async def mcp_agent_node(state: dict) -> dict:
    """외부 MCP 도구를 실행"""
    from app.services.rag_service import get_rag_service

    await _emit(state, {
        "type": "thinking",
        "thinking": "🔌 MCP Agent: 외부 도구를 실행합니다...",
        "active_agent": "mcp",
    })
    await _emit(state, {"type": "agent_status", "agent": "mcp", "status": "active"})

    t0 = time.time()
    rag_service = get_rag_service()

    try:
        tool_ctx = await rag_service._execute_mcp_tools(
            state["message"],
            state.get("active_mcp_ids", []),
            state.get("use_deep_think", False),
            state["user_id"],
            state.get("db"),
        )
    except Exception as e:
        logger.error(f"[Orchestrator] MCP agent error: {e}")
        tool_ctx = ""

    duration = int((time.time() - t0) * 1000)

    result = {"agent": "mcp", "context": tool_ctx or "", "duration_ms": duration}
    tool_call = {
        "name": "mcp_tools",
        "input": {"mcp_ids": state.get("active_mcp_ids", [])},
        "output": (tool_ctx or "")[:500],
        "duration_ms": duration,
    }

    await _emit(state, {
        "type": "thinking",
        "thinking": f"🔌 MCP Agent: 도구 실행 완료 ({duration}ms)",
        "active_agent": "mcp",
    })
    await _emit(state, {"type": "agent_status", "agent": "mcp", "status": "done", "duration_ms": duration})

    return {
        "agent_results": state.get("agent_results", []) + [result],
        "tool_calls_log": state.get("tool_calls_log", []) + [tool_call],
        "current_step": state.get("current_step", 0) + 1,
    }


# ─────────────────────────────────────────────────────
# T2SQL AGENT NODE: 자체 스트림 (short-circuit)
# ─────────────────────────────────────────────────────
async def t2sql_agent_node(state: dict) -> dict:
    """Text-to-SQL — 자체적으로 sql/table 이벤트를 스트림"""
    from app.services.rag_service import get_rag_service

    await _emit(state, {
        "type": "thinking",
        "thinking": "🗄️ T2SQL Agent: 데이터베이스 쿼리를 생성합니다...",
        "active_agent": "t2sql",
    })

    try:
        from app.services.t2sql_service import get_t2sql_service
        from app.api.endpoints.settings import get_db_connection_for_user, _build_connection_uri

        conn = await get_db_connection_for_user(state["user_id"], state["db_connection_id"])
        if not conn:
            await _emit(state, {
                "type": "content",
                "content": "데이터베이스 연결을 찾을 수 없습니다. 설정에서 DB 연결을 확인해주세요.",
            })
            await _emit_sentinel(state)
            return state

        uri = _build_connection_uri(conn)
        t2sql = get_t2sql_service()

        rag_service = get_rag_service()
        t2sql_llm = await rag_service._get_llm_instance(state["model"], state["user_id"], state.get("db"))

        async for chunk_str in t2sql.generate_and_execute(
            state["message"], uri,
            model=state["model"],
            llm_instance=t2sql_llm,
            schema_metadata=conn.get("schema_metadata"),
        ):
            try:
                data = json.loads(chunk_str.strip())
                data["active_agent"] = "t2sql"
                await _emit(state, data)
            except json.JSONDecodeError:
                pass

    except Exception as e:
        logger.error(f"[Orchestrator] T2SQL agent error: {e}", exc_info=True)
        await _emit(state, {
            "type": "content",
            "content": f"SQL 쿼리 처리 중 오류: {str(e)}",
        })

    await _emit_sentinel(state)
    return state


# ─────────────────────────────────────────────────────
# PROCESS AGENT NODE: xLAM 물류 (short-circuit)
# ─────────────────────────────────────────────────────
async def process_agent_node(state: dict) -> dict:
    """xLAM 물류 에이전트 — 자체 스트림"""
    await _emit(state, {
        "type": "thinking",
        "thinking": "⚙️ Process Agent: xLAM 물류 파이프라인을 실행합니다...",
        "active_agent": "process",
    })

    try:
        from app.services.xlam_service import get_xlam_service
        from app.services.rag_service import get_rag_service

        xlam = get_xlam_service()
        rag_service = get_rag_service()
        xlam_llm = await rag_service._get_llm_instance(state["model"], state["user_id"], state.get("db"))

        async for chunk_str in xlam.run_pipeline(
            state["message"],
            state["kb_ids"][0] if state["kb_ids"] else "default_kb",
            state["user_id"],
            db=state.get("db"),
            llm_instance=xlam_llm,
        ):
            try:
                data = json.loads(chunk_str.strip())
                data["active_agent"] = "process"
                await _emit(state, data)
            except json.JSONDecodeError:
                pass

    except Exception as e:
        logger.error(f"[Orchestrator] Process agent error: {e}", exc_info=True)
        await _emit(state, {
            "type": "content",
            "content": f"물류 처리 중 오류: {str(e)}",
        })

    await _emit_sentinel(state)
    return state


# ─────────────────────────────────────────────────────
# SYNTHESIZER NODE: 컨텍스트 통합 + 답변 생성
# ─────────────────────────────────────────────────────
async def synthesizer_node(state: dict) -> dict:
    """에이전트 결과를 통합하여 최종 답변을 생성"""
    from app.services.rag_service import get_rag_service

    # 1. 컨텍스트 통합 + 소스 수집
    context_parts = []
    all_sources = []
    label_map = {
        "rag": "Knowledge Base",
        "web_search": "Web Search Result",
        "mcp": "Tool Execution Result",
    }

    for r in state.get("agent_results", []):
        if r.get("context"):
            label = label_map.get(r["agent"], r["agent"])
            context_parts.append(f"[{label}]\n{r['context']}")
        if r.get("sources"):
            all_sources.extend(r["sources"])

    context_text = "\n\n---\n\n".join(context_parts) if context_parts else ""

    # 소스 메타데이터 SSE 전송
    if all_sources:
        await _emit(state, {"type": "sources", "sources": all_sources})
        # 인용 지시를 컨텍스트에 추가
        context_text += "\n\n[인용 지시] 답변에서 출처를 인용할 때 [1], [2] 형식으로 번호를 사용하세요. 각 번호는 위의 [Source N]에 해당합니다."

    await _emit(state, {
        "type": "thinking",
        "thinking": "💬 Synthesizer: 수집된 정보를 종합하여 답변을 생성합니다...",
        "active_agent": "synthesizer",
    })
    await _emit(state, {"type": "agent_status", "agent": "synthesizer", "status": "active"})

    # 2. tool_calls_meta 전송
    if state.get("tool_calls_log"):
        await _emit(state, {
            "type": "tool_calls_meta",
            "tool_calls": state["tool_calls_log"],
            "intent": state.get("planned_agents", []),
        })

    # 3. 답변 스트림 생성
    rag_service = get_rag_service()
    full_response = ""

    try:
        async for chunk in rag_service._generate_answer(
            state["message"],
            context_text,
            state["llm"],
            state.get("system_prompt"),
            state.get("history"),
            images=state.get("images"),
            model=state.get("model"),
        ):
            full_response += chunk
            await _emit(state, {"type": "content", "content": chunk})
    except Exception as e:
        logger.error(f"[Orchestrator] Synthesizer error: {e}", exc_info=True)
        error_msg = f"답변 생성 중 오류: {str(e)}"
        await _emit(state, {"type": "content", "content": error_msg})

    # 4. Deep Think 자기성찰
    if state.get("use_deep_think") and len(full_response) > 50:
        try:
            async for ref_chunk in rag_service._self_reflection(
                state["message"], full_response, state["llm"]
            ):
                try:
                    data = json.loads(ref_chunk.strip())
                    await _emit(state, data)
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            logger.debug(f"Self-reflection skipped: {e}")

    # 5. Synthesizer 완료 + 종료 시그널
    await _emit(state, {"type": "agent_status", "agent": "synthesizer", "status": "done", "duration_ms": 0})
    await _emit_sentinel(state)
    return state
