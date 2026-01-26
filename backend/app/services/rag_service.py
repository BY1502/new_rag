import json
import asyncio
import os
import torch
from typing import AsyncGenerator, List
from langchain_ollama import ChatOllama
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.agents import AgentExecutor, create_tool_calling_agent
from app.core.config import settings
from app.services.vector_store import VectorStoreService # 추가

class RAGService:
    def __init__(self):
        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
        self.vector_service = VectorStoreService() # VectorService 활용
        
        self.llm = ChatOllama(
            model=settings.LLM_MODEL,
            temperature=0.1,
        )
        self.qdrant_client = QdrantClient(url=settings.QDRANT_URL)

    async def generate_response(
        self, 
        message: str, 
        kb_id: str, 
        user_id: int, 
        use_web_search: bool = False
    ) -> AsyncGenerator[str, None]:
        
        try:
            # [Redis] 대화 기록 키 생성 시 user_id 포함 (이미 API단에서 세션 관리하지만, 내부적으로도 분리)
            session_id = f"user_{user_id}_default" 

            context_text = ""
            
            # [Vector Search] 유저 ID로 필터링된 Retriever 가져오기
            yield json.dumps({"type": "thinking", "thinking": f"🔒 유저({user_id}) 전용 데이터 검색 중..."}) + "\n"
            
            retriever = self.vector_service.get_retriever(kb_id, user_id)
            docs = await retriever.ainvoke(message)
            
            if docs:
                context_text = "\n\n".join([doc.page_content for doc in docs])
                sources = list(set([doc.metadata.get("source", "Unknown") for doc in docs]))
                yield json.dumps({"type": "thinking", "thinking": f"✅ 문서 발견: {', '.join(sources)}"}) + "\n"
            else:
                yield json.dumps({"type": "thinking", "thinking": "❌ 검색 결과 없음 (본인 문서만 검색됨)"}) + "\n"
            
            # --- Chat Prompt ---
            prompt = ChatPromptTemplate.from_template("""
            [문맥]
            {context}
            
            [질문]
            {question}
            
            위 문맥을 바탕으로 답변하세요. 문맥이 없으면 아는 대로 답하세요.
            """)
            
            chain = prompt | self.llm
            
            async for chunk in chain.astream({"context": context_text, "question": message}):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                yield json.dumps({"type": "content", "content": content}) + "\n"

        except Exception as e:
            import traceback
            print(traceback.format_exc())
            yield json.dumps({"type": "content", "content": f"Error: {str(e)}"}) + "\n"