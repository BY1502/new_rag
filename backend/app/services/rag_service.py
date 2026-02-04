import json
import asyncio
import os
from typing import AsyncGenerator, List, Optional
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from app.core.config import settings
from app.services.vector_store import VectorStoreService

class RAGService:
    def __init__(self):
        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
        self.vector_service = VectorStoreService()
        
        self.llm = ChatOllama(
            model=settings.LLM_MODEL,
            temperature=0.1,
        )

    async def generate_response(
        self, 
        message: str, 
        kb_id: str, 
        user_id: int, 
        use_web_search: bool = False,
        active_mcp_ids: Optional[List[str]] = None
    ) -> AsyncGenerator[str, None]:
        
        try:
            # 1. 검색 시작 알림
            yield json.dumps({"type": "thinking", "thinking": f"🔍 지식 베이스({kb_id}) 검색 중..."}) + "\n"
            
            # 2. 벡터 검색
            retriever = self.vector_service.get_retriever(kb_id, user_id)
            docs = await retriever.ainvoke(message)
            
            context_text = ""
            if docs:
                # [디버깅] 실제 LLM에 들어가는 텍스트가 무엇인지 서버 로그에 출력
                print(f"--- [RAG Context Retrieved] ---")
                for i, doc in enumerate(docs):
                    # 벡터 데이터가 텍스트로 들어오는 것을 방지하기 위한 정제
                    clean_content = doc.page_content.replace("{", "").replace("}", "") # JSON 괄호 같은거 제거 시도
                    # 너무 길면 잘라서 로그 확인
                    print(f"Doc {i+1}: {doc.page_content[:100]}...") 
                    
                print(f"-------------------------------")

                context_text = "\n\n".join([doc.page_content for doc in docs])
                sources = list(set([doc.metadata.get("source", "Unknown") for doc in docs]))
                yield json.dumps({"type": "thinking", "thinking": f"✅ 문서 {len(docs)}개 참조: {', '.join(sources)}"}) + "\n"
            else:
                yield json.dumps({"type": "thinking", "thinking": "❌ 관련 문서를 찾지 못했습니다."}) + "\n"
            
            # 3. 프롬프트 (강력한 지시사항 추가)
            prompt = ChatPromptTemplate.from_template("""
            당신은 RAG(Retrieval-Augmented Generation) AI 어시스턴트입니다.
            아래 [문맥]에 제공된 내용을 바탕으로 [질문]에 답변하세요.
            
            중요:
            1. [문맥]에 'Vector', 'Dense', 'Sparse' 같은 데이터 구조가 보이면 무시하고, 실제 텍스트 내용만 참고하세요.
            2. 문맥에 정보가 없다면 솔직하게 모른다고 말하세요.
            3. 답변은 자연스러운 한국어로 하세요.

            [문맥]
            {context}
            
            [질문]
            {question}
            """)
            
            chain = prompt | self.llm
            
            # 4. 답변 생성 및 스트리밍
            async for chunk in chain.astream({"context": context_text, "question": message}):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                yield json.dumps({"type": "content", "content": content}) + "\n"

        except Exception as e:
            import traceback
            print(traceback.format_exc())
            yield json.dumps({"type": "content", "content": f"시스템 오류: {str(e)}"}) + "\n"