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
from app.services.xlam_service import XLAMService

class RAGService:
    def __init__(self):
        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
        self.vector_service = VectorStoreService()
        self.xlam_service = XLAMService()
        self.web_search_tool = DuckDuckGoSearchRun()
        # 기본 LLM은 설정값 따름 (fallback용)
        self.default_model = settings.LLM_MODEL

    async def generate_response(
        self, 
        message: str, 
        kb_id: str, 
        user_id: int, 
        model: Optional[str] = None, # ✅ 동적 모델 받기
        use_web_search: bool = False,
        use_deep_think: bool = False, # ✅ 딥 씽킹 플래그
        active_mcp_ids: Optional[List[str]] = None
    ) -> AsyncGenerator[str, None]:
        
        try:
            # 1. 모델 결정 (프론트 요청 > 환경변수)
            target_model = model if model else self.default_model
            
            # 매 요청마다 모델을 새로 초기화 (다이나믹 모델 스위칭을 위해)
            # (LangChain ChatOllama는 가벼워서 오버헤드가 적음)
            llm = ChatOllama(model=target_model, temperature=0)

            # --- [Router] 질문 의도 분석 ---
            route = "rag"
            
            # 딥 씽킹이 켜져있으면 분석 과정을 보여줌
            if use_deep_think:
                yield json.dumps({"type": "thinking", "thinking": f"🧠 Deep Thinking: '{target_model}' 모델로 질문 의도를 분석 중..."}) + "\n"
                
                router_prompt = ChatPromptTemplate.from_template("""
                Analyze the user's question and choose the best processing mode.
                Question: {question}
                
                Modes:
                - 'process': Logistics/Business execution (dispatch, order, route).
                - 'search': Real-time info (weather, news).
                - 'rag': Document/Manual based Q&A.
                
                Return ONLY the mode name (process/search/rag).
                """)
                router_chain = router_prompt | llm | StrOutputParser()
                try:
                    route_result = await router_chain.ainvoke({"question": message})
                    route = route_result.strip().lower()
                    yield json.dumps({"type": "thinking", "thinking": f"🧭 분석 결과: '{route}' 모드로 전략 수립"}) + "\n"
                except:
                    yield json.dumps({"type": "thinking", "thinking": f"⚠️ 분석 실패. 기본 RAG 모드로 진행합니다."}) + "\n"
            
            else:
                # 딥 씽킹 꺼져있으면 키워드로 빠르게 판단
                if use_web_search: route = "search"
                elif any(k in message for k in ["배차", "주문", "루트", "지시"]): route = "process"
                else: route = "rag"

            # --- [MODE 1] xLAM Process ---
            if "process" in route:
                yield json.dumps({"type": "thinking", "thinking": "🚀 xLAM 자율 에이전트 모드로 전환합니다."}) + "\n"
                # xLAM에게도 모델 정보 전달하고 싶으면 XLAMService 수정 필요 (여기선 생략)
                async for chunk in self.xlam_service.run_pipeline(message, kb_id, user_id):
                    yield chunk
                return

            context_text = ""
            
            # --- [MODE 2] Web Search ---
            if "search" in route:
                if use_deep_think: yield json.dumps({"type": "thinking", "thinking": "🌐 최신 정보를 위해 웹 검색을 실행합니다..."}) + "\n"
                try:
                    res = self.web_search_tool.invoke(message)
                    context_text = f"[Web Search Result]\n{res}"
                except:
                    context_text = "검색 실패"
                    
            # --- [MODE 3] RAG ---
            else:
                if use_deep_think: yield json.dumps({"type": "thinking", "thinking": f"🔍 지식 베이스({kb_id})에서 관련 문서를 탐색 중..."}) + "\n"
                retriever = self.vector_service.get_retriever(kb_id, user_id)
                docs = await retriever.ainvoke(message)
                if docs:
                    context_text = "\n\n".join([doc.page_content for doc in docs])
                    if use_deep_think: yield json.dumps({"type": "thinking", "thinking": f"✅ 문서 {len(docs)}개를 참조하여 답변 구성"}) + "\n"
                else:
                    context_text = ""
                    if use_deep_think: yield json.dumps({"type": "thinking", "thinking": "❌ 관련 문서를 찾지 못했습니다."}) + "\n"

            # 답변 생성
            prompt = ChatPromptTemplate.from_template("""
            [문맥]
            {context}
            [질문]
            {question}
            
            답변해주세요:
            """)
            chain = prompt | llm
            full_response = ""
            async for chunk in chain.astream({"context": context_text, "question": message}):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                full_response += content
                yield json.dumps({"type": "content", "content": content}) + "\n"

            # [Self-Correction] 자기 검증 (Deep Thinking ON일 때만)
            if use_deep_think and len(full_response) > 50:
                yield json.dumps({"type": "thinking", "thinking": "🛡️ 답변의 정확성을 자체 검증(Self-Reflection) 중..."}) + "\n"
                reflection_prompt = ChatPromptTemplate.from_template("""
                Question: {question}
                Answer: {answer}
                Rate the answer's accuracy (0-100). Output only the number.
                """)
                try:
                    score = await (reflection_prompt | llm | StrOutputParser()).ainvoke({"question": message, "answer": full_response})
                    score_num = int(''.join(filter(str.isdigit, score)))
                    if score_num > 80:
                         yield json.dumps({"type": "thinking", "thinking": f"✨ 검증 완료: 신뢰도 높음 ({score_num}점)"}) + "\n"
                except: pass

        except Exception as e:
            import traceback
            print(traceback.format_exc())
            yield json.dumps({"type": "content", "content": f"Error: {str(e)}"}) + "\n"