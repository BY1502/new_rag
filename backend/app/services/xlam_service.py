import json
import os
import logging
from functools import lru_cache
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import create_tool_calling_agent, AgentExecutor
from app.core.config import settings
from app.services.vector_store import get_vector_store_service
from app.services.graph_store import get_graph_store_service
from app.services.qdrant_resolver import resolve_qdrant_client
from app.tools.logistics import get_logistics_tools

logger = logging.getLogger(__name__)

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
        XLAMService._initialized = True

        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
        self.vector_service = get_vector_store_service()
        self.graph_service = get_graph_store_service()

        # xLAM용 고성능 모델 사용 권장 (Tool Calling 지원 모델)
        self.llm = ChatOllama(
            model=settings.LLM_MODEL,
            temperature=0
        )
        self.tools = get_logistics_tools()
        logger.info("XLAMService initialized (singleton)")

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

    async def run_pipeline(self, user_query: str, kb_id: str, user_id: int, db=None):
        """xLAM 실행 파이프라인"""

        yield json.dumps({"type": "thinking", "thinking": "xLAM: 관련 매뉴얼(Vector DB)을 참조 중..."}) + "\n"

        # 1. 매뉴얼 검색
        manual_context = await self.retrieve_manual(user_query, kb_id, user_id, db=db)

        # 2. 에이전트 프롬프트 구성
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

        # 3. 에이전트 생성
        agent = create_tool_calling_agent(self.llm, self.tools, prompt)
        agent_executor = AgentExecutor(agent=agent, tools=self.tools, verbose=True)

        yield json.dumps({"type": "thinking", "thinking": "xLAM: 프로세스 계획 수립 및 실행 시작..."}) + "\n"

        # 4. 실행 및 로그 기록
        try:
            # Neo4j 로그: 시작
            session_id = f"sess_{user_id}_{id(user_query)}"
            self.graph_service.log_process_execution(session_id, "xLAM_Start", "STARTED", user_query)

            # 실행
            result = await agent_executor.ainvoke({"input": user_query})

            # Neo4j 로그: 종료
            self.graph_service.log_process_execution(session_id, "xLAM_End", "COMPLETED", result['output'])

            yield json.dumps({"type": "thinking", "thinking": "모든 프로세스가 완료되었습니다."}) + "\n"
            yield json.dumps({"type": "content", "content": result['output']}) + "\n"

        except Exception as e:
            logger.error(f"xLAM pipeline error: {e}")
            self.graph_service.log_process_execution(f"sess_{user_id}", "xLAM_Error", "FAILED", str(e))
            yield json.dumps({"type": "content", "content": f"Error executing xLAM pipeline: {str(e)}"}) + "\n"


@lru_cache()
def get_xlam_service() -> XLAMService:
    """싱글톤 XLAMService 인스턴스 반환"""
    return XLAMService()
