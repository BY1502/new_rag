"""
LangGraph 그래프 정의
Supervisor → [Specialist Agents] → Synthesizer 파이프라인
"""
import logging
from langgraph.graph import StateGraph, END
from .state import OrchestratorState
from .nodes import (
    supervisor_node,
    rag_agent_node,
    web_search_agent_node,
    mcp_agent_node,
    t2sql_agent_node,
    process_agent_node,
    synthesizer_node,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────
# 라우팅 함수
# ─────────────────────────────────────────────────────

def route_after_supervisor(state: dict) -> str:
    """Supervisor 이후 라우팅: short-circuit 또는 첫 번째 planned agent"""
    sc = state.get("short_circuit")
    if sc == "t2sql":
        return "t2sql_agent"
    if sc == "process":
        return "process_agent"

    planned = state.get("planned_agents", [])
    if not planned:
        return "synthesizer"

    first = planned[0]
    node_name = f"{first}_agent"
    # 유효한 노드인지 확인
    valid = {"rag_agent", "web_search_agent", "mcp_agent"}
    return node_name if node_name in valid else "synthesizer"


def route_next_agent(state: dict) -> str:
    """현재 에이전트 완료 후 다음 에이전트 또는 synthesizer로 라우팅"""
    executed = {r["agent"] for r in state.get("agent_results", [])}
    planned = state.get("planned_agents", [])

    for agent in planned:
        if agent not in executed:
            node_name = f"{agent}_agent"
            valid = {"rag_agent", "web_search_agent", "mcp_agent"}
            if node_name in valid:
                return node_name

    return "synthesizer"


# ─────────────────────────────────────────────────────
# 그래프 빌드
# ─────────────────────────────────────────────────────

def build_graph():
    """멀티 에이전트 오케스트레이션 그래프 생성"""
    g = StateGraph(OrchestratorState)

    # 노드 등록
    g.add_node("supervisor", supervisor_node)
    g.add_node("rag_agent", rag_agent_node)
    g.add_node("web_search_agent", web_search_agent_node)
    g.add_node("mcp_agent", mcp_agent_node)
    g.add_node("t2sql_agent", t2sql_agent_node)
    g.add_node("process_agent", process_agent_node)
    g.add_node("synthesizer", synthesizer_node)

    # 엔트리 포인트
    g.set_entry_point("supervisor")

    # Supervisor → 분기
    g.add_conditional_edges("supervisor", route_after_supervisor, {
        "t2sql_agent": "t2sql_agent",
        "process_agent": "process_agent",
        "rag_agent": "rag_agent",
        "web_search_agent": "web_search_agent",
        "mcp_agent": "mcp_agent",
        "synthesizer": "synthesizer",
    })

    # T2SQL / Process → END (자체 스트림 완결)
    g.add_edge("t2sql_agent", END)
    g.add_edge("process_agent", END)

    # 일반 에이전트 → 다음 에이전트 또는 synthesizer
    routing_map = {
        "rag_agent": "rag_agent",
        "web_search_agent": "web_search_agent",
        "mcp_agent": "mcp_agent",
        "synthesizer": "synthesizer",
    }
    for node_name in ["rag_agent", "web_search_agent", "mcp_agent"]:
        g.add_conditional_edges(node_name, route_next_agent, routing_map)

    # Synthesizer → END
    g.add_edge("synthesizer", END)

    return g.compile()
