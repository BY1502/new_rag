import json
import os
import logging
from functools import lru_cache
from typing import Any, Optional
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from app.core.config import settings
from app.services.vector_store import get_vector_store_service
from app.services.graph_store import get_graph_store_service
from app.services.qdrant_resolver import resolve_qdrant_client
from app.tools.logistics import get_logistics_tools

logger = logging.getLogger(__name__)

# Tool Calling을 지원하는 Ollama 모델 목록
_TOOL_CALLING_MODELS = {
    "llama3.1", "llama3.2", "llama3.3",
    "qwen2.5", "qwen3",
    "mistral", "mistral-small", "mistral-nemo",
    "command-r", "command-r-plus",
    "firefunction-v2",
    "hermes3",
}


def _supports_tool_calling(model_name: str) -> bool:
    """모델이 native tool calling을 지원하는지 확인"""
    if not model_name:
        return False
    lower = model_name.lower().split(":")[0]  # 태그 제거 (e.g., "llama3.1:8b" → "llama3.1")
    return any(lower == m or lower.startswith(m + ":") or lower.startswith(m + "-")
               for m in _TOOL_CALLING_MODELS)


class XLAMService:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if XLAMService._initialized:
            return

        try:
            os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
            self.vector_service = get_vector_store_service()
            self.graph_service = get_graph_store_service()

            # 기본 LLM (Ollama) - 외부 API 사용 시 run_pipeline에서 오버라이드됨
            self.default_llm = ChatOllama(
                model=settings.LLM_MODEL,
                temperature=0,
                timeout=120
            )
            self.tools = get_logistics_tools()

            XLAMService._initialized = True
            logger.info("XLAMService initialized (singleton)")
        except Exception as e:
            logger.error(f"XLAMService 초기화 실패: {e}", exc_info=True)
            XLAMService._initialized = False
            raise

    def _log_process(self, session_id: str, step: str, status: str, details: str):
        """Neo4j 프로세스 로그 (연결 실패 시 무시)"""
        try:
            self.graph_service.log_process_execution(session_id, step, status, details)
        except Exception as e:
            logger.warning(f"Neo4j 로그 기록 실패 (무시): {e}")

    async def retrieve_manual(self, query: str, kb_id: str, user_id: int, db=None):
        """Vector DB에서 매뉴얼 검색"""
        ext_client = None
        if db:
            ext_client = await resolve_qdrant_client(db, user_id, kb_id)
        retriever = self.vector_service.get_retriever(kb_id, user_id, qdrant_client=ext_client)
        docs = await retriever.ainvoke(f"{query} manual process procedure")
        if not docs:
            # 매뉴얼이 아직 없을 경우를 대비한 기본 매뉴얼 (Fallback)
            return """
            [Logistics Process Manual]
            1. Use 'query_closed_orders' to get orders from RDB.
            2. Use 'convert_address_to_coordinates' to add lat/lng.
            3. Use 'run_dispatch_algorithm' to group orders.
            4. Use 'generate_vehicle_routes' to plan routes.
            5. Use 'generate_delivery_instructions' to send to drivers.
            """
        return "\n".join([d.page_content for d in docs])

    def _build_tool_descriptions(self) -> str:
        """도구 설명 문자열 생성 (ReAct 에이전트용)"""
        lines = []
        for t in self.tools:
            lines.append(f"- {t.name}: {t.description}")
        return "\n".join(lines)

    async def _run_react_pipeline(self, user_query: str, manual_context: str, llm: Any):
        """
        ReAct 방식 파이프라인 (tool calling 미지원 모델용)
        LLM이 단계별로 도구를 선택하고 실행하는 loop
        """
        tool_map = {t.name: t for t in self.tools}
        tool_desc = self._build_tool_descriptions()

        react_prompt = ChatPromptTemplate.from_messages([
            ("system", f"""You are xLAM (Large Action Model), an autonomous logistics manager.
Execute the logistics process strictly according to the MANUAL.

[MANUAL]
{manual_context}

[AVAILABLE TOOLS]
{tool_desc}

[INSTRUCTIONS]
For each step, respond in EXACTLY this format:
THOUGHT: <reasoning about what to do next>
ACTION: <tool_name>
INPUT: <input string for the tool>

When all steps are complete, respond with:
THOUGHT: All steps complete.
FINAL_ANSWER: <final summary>

IMPORTANT: Only use one ACTION per response. Wait for the result before proceeding."""),
            ("human", "{input}"),
        ])

        chain = react_prompt | llm | StrOutputParser()

        conversation_input = user_query
        all_outputs = []
        max_iterations = 10

        for iteration in range(max_iterations):
            try:
                response = await chain.ainvoke({"input": conversation_input})
                response = response.strip()
                logger.info(f"[xLAM ReAct #{iteration}] {response[:200]}")
            except Exception as e:
                logger.error(f"[xLAM ReAct] LLM 호출 실패: {e}")
                yield json.dumps({"type": "content", "content": f"LLM 호출 중 오류 발생: {str(e)}"}) + "\n"
                return

            # FINAL_ANSWER 체크
            if "FINAL_ANSWER:" in response:
                final = response.split("FINAL_ANSWER:")[-1].strip()
                yield json.dumps({"type": "thinking", "thinking": "모든 프로세스가 완료되었습니다."}) + "\n"
                yield json.dumps({"type": "content", "content": final}) + "\n"
                return

            # ACTION 파싱
            action_name = None
            action_input = ""
            for line in response.split("\n"):
                line = line.strip()
                if line.startswith("ACTION:"):
                    action_name = line.replace("ACTION:", "").strip()
                elif line.startswith("INPUT:"):
                    action_input = line.replace("INPUT:", "").strip()

            if not action_name or action_name not in tool_map:
                # 도구를 선택하지 못한 경우 → 응답 자체를 최종 답변으로 처리
                if iteration > 0 and all_outputs:
                    yield json.dumps({"type": "content", "content": response}) + "\n"
                    return
                # 첫 반복에서 도구 미선택 → 프롬프트 문제, 재시도
                conversation_input = f"{user_query}\n\nPlease follow the MANUAL and start with Step 1. Use the ACTION format."
                continue

            # 도구 실행
            yield json.dumps({
                "type": "thinking",
                "thinking": f"도구 실행: {action_name}"
            }) + "\n"

            try:
                tool_result = tool_map[action_name].invoke(action_input)
                all_outputs.append(f"[{action_name}] {tool_result[:200]}")
            except Exception as e:
                tool_result = f"Error: {str(e)}"
                logger.warning(f"[xLAM ReAct] Tool {action_name} failed: {e}")

            # 다음 반복을 위해 결과를 대화에 추가
            conversation_input = (
                f"{user_query}\n\n"
                f"Previous action: {action_name}\n"
                f"Result: {tool_result}\n\n"
                f"Continue to the next step according to the MANUAL."
            )

        # max iterations 초과
        yield json.dumps({
            "type": "content",
            "content": "프로세스가 최대 반복 횟수에 도달했습니다.\n\n실행 결과:\n" + "\n".join(all_outputs)
        }) + "\n"

    async def run_pipeline(self, user_query: str, kb_id: str, user_id: int, db=None, llm_instance: Any = None):
        """xLAM 실행 파이프라인"""

        yield json.dumps({"type": "thinking", "thinking": "xLAM: 관련 매뉴얼(Vector DB)을 참조 중..."}) + "\n"

        # LLM 인스턴스: 외부 API 모델이 전달되면 사용, 아니면 기본 Ollama
        llm = llm_instance or self.default_llm

        # 1. 매뉴얼 검색
        manual_context = await self.retrieve_manual(user_query, kb_id, user_id, db=db)

        session_id = f"sess_{user_id}_{id(user_query)}"

        # 2. 모델의 tool calling 지원 여부 판단
        model_name = getattr(llm, 'model', getattr(llm, 'model_name', ''))
        use_tool_calling = _supports_tool_calling(model_name)

        # 외부 API (OpenAI, Anthropic, Google)는 모두 tool calling 지원
        llm_class = type(llm).__name__
        if llm_class in ("ChatOpenAI", "ChatAnthropic", "ChatGoogleGenerativeAI"):
            use_tool_calling = True

        if use_tool_calling:
            # --- Tool Calling Agent (native 지원 모델) ---
            yield json.dumps({"type": "thinking", "thinking": "xLAM: Tool Calling 에이전트로 실행합니다."}) + "\n"

            from langchain.agents import create_tool_calling_agent, AgentExecutor

            prompt = ChatPromptTemplate.from_messages([
                ("system", f"""You are xLAM (Large Action Model), an autonomous logistics manager.
            You must execute the logistics process strictly according to the following MANUAL.

            [MANUAL]
            {manual_context}

            Your goal is to complete the user's request by calling the appropriate tools in the correct order.
            Always check the output of the previous tool before calling the next one.
            """),
                ("human", "{input}"),
                ("placeholder", "{agent_scratchpad}"),
            ])

            try:
                agent = create_tool_calling_agent(llm, self.tools, prompt)
                agent_executor = AgentExecutor(
                    agent=agent, tools=self.tools, verbose=True,
                    max_iterations=10, handle_parsing_errors=True
                )

                yield json.dumps({"type": "thinking", "thinking": "xLAM: 프로세스 계획 수립 및 실행 시작..."}) + "\n"

                self._log_process(session_id, "xLAM_Start", "STARTED", user_query)
                result = await agent_executor.ainvoke({"input": user_query})
                self._log_process(session_id, "xLAM_End", "COMPLETED", result['output'])

                yield json.dumps({"type": "thinking", "thinking": "모든 프로세스가 완료되었습니다."}) + "\n"
                yield json.dumps({"type": "content", "content": result['output']}) + "\n"

            except Exception as e:
                logger.error(f"xLAM tool-calling pipeline error: {e}", exc_info=True)
                self._log_process(session_id, "xLAM_Error", "FAILED", str(e))

                # Tool calling 실패 시 ReAct 폴백
                yield json.dumps({
                    "type": "thinking",
                    "thinking": f"Tool Calling 실패 ({str(e)[:80]}), ReAct 모드로 전환합니다."
                }) + "\n"
                async for chunk in self._run_react_pipeline(user_query, manual_context, llm):
                    yield chunk
        else:
            # --- ReAct Agent (tool calling 미지원 모델) ---
            yield json.dumps({
                "type": "thinking",
                "thinking": f"xLAM: {model_name} 모델은 Tool Calling을 지원하지 않아 ReAct 모드로 실행합니다."
            }) + "\n"

            self._log_process(session_id, "xLAM_Start_ReAct", "STARTED", user_query)

            try:
                async for chunk in self._run_react_pipeline(user_query, manual_context, llm):
                    yield chunk
                self._log_process(session_id, "xLAM_End_ReAct", "COMPLETED", "ReAct pipeline finished")
            except Exception as e:
                logger.error(f"xLAM ReAct pipeline error: {e}", exc_info=True)
                self._log_process(session_id, "xLAM_Error", "FAILED", str(e))
                yield json.dumps({"type": "content", "content": f"xLAM 파이프라인 실행 오류: {str(e)}"}) + "\n"


@lru_cache()
def get_xlam_service() -> XLAMService:
    """싱글톤 XLAMService 인스턴스 반환"""
    return XLAMService()
