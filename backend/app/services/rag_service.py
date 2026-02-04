import json
import asyncio
import os
from typing import AsyncGenerator, List, Optional
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.tools import DuckDuckGoSearchRun
from app.core.config import settings
from app.services.vector_store import VectorStoreService
from app.services.xlam_service import XLAMService # ✅ 추가

class RAGService:
    def __init__(self):
        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
        self.vector_service = VectorStoreService()
        self.xlam_service = XLAMService() # ✅ xLAM 초기화
        
        self.llm = ChatOllama(model=settings.LLM_MODEL, temperature=0)
        self.web_search_tool = DuckDuckGoSearchRun()

    async def generate_response(
        self, 
        message: str, 
        kb_id: str, 
        user_id: int, 
        use_web_search: bool = False,
        active_mcp_ids: Optional[List[str]] = None
    ) -> AsyncGenerator[str, None]:
        
        try:
            # [Router] 질문 의도 분석
            yield json.dumps({"type": "thinking", "thinking": "🤔 질문의 의도를 분석하고 있습니다..."}) + "\n"
            
            router_prompt = ChatPromptTemplate.from_template("""
            Analyze the user's question and choose the best processing mode.
            
            Question: {question}
            
            Options:
            - 'process': Use this if the user wants to execute a logistics/business process (e.g., "dispatch orders", "create routes", "check closed orders").
            - 'search': Use this if the user asks for real-time external info (e.g., weather, news).
            - 'rag': Use this for questions about documents/manuals.
            - 'chat': Use this for general conversation.
            
            Answer (process/search/rag/chat):
            """)
            router_chain = router_prompt | self.llm | StrOutputParser()
            
            # xLAM 모드 강제 조건 (active_mcp_ids에 'xlam'이 있거나, web_search가 꺼져있을 때 판단)
            route = "rag"
            if use_web_search:
                route_result = await router_chain.ainvoke({"question": message})
                route = route_result.strip().lower()
            elif "배차" in message or "주문" in message or "루트" in message or "지시" in message:
                route = "process" # 간단한 키워드 감지
            
            # --- [MODE 1] xLAM Process Execution ---
            if "process" in route:
                yield json.dumps({"type": "thinking", "thinking": "🚀 xLAM 자율 에이전트 모드로 전환합니다."}) + "\n"
                async for chunk in self.xlam_service.run_pipeline(message, kb_id, user_id):
                    yield chunk
                return

            # --- [MODE 2] Web Search ---
            if "search" in route:
                yield json.dumps({"type": "thinking", "thinking": "🌐 웹 검색을 실행합니다..."}) + "\n"
                try:
                    res = self.web_search_tool.invoke(message)
                    context_text = f"[Web Search Result]\n{res}"
                except:
                    context_text = "검색 실패"
                    
            # --- [MODE 3] RAG (Document Search) ---
            else:
                yield json.dumps({"type": "thinking", "thinking": f"🔍 문서 검색 중..."}) + "\n"
                retriever = self.vector_service.get_retriever(kb_id, user_id)
                docs = await retriever.ainvoke(message)
                if docs:
                    context_text = "\n\n".join([doc.page_content for doc in docs])
                    yield json.dumps({"type": "thinking", "thinking": f"✅ 문서 {len(docs)}개 참조"}) + "\n"
                else:
                    context_text = ""
                    yield json.dumps({"type": "thinking", "thinking": "❌ 관련 문서 없음"}) + "\n"

            # 답변 생성 (RAG/General)
            prompt = ChatPromptTemplate.from_template("""
            [문맥]
            {context}
            
            [질문]
            {question}
            
            답변해주세요:
            """)
            chain = prompt | self.llm
            async for chunk in chain.astream({"context": context_text, "question": message}):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                yield json.dumps({"type": "content", "content": content}) + "\n"

        except Exception as e:
            import traceback
            print(traceback.format_exc())
            yield json.dumps({"type": "content", "content": f"Error: {str(e)}"}) + "\n"