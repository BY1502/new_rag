const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();

const files = {
  // 1. [Backend] 스키마에 use_deep_think 필드 추가
  "backend/app/schemas/chat.py": `from pydantic import BaseModel
from typing import Optional, List

class ChatRequest(BaseModel):
    message: str
    kb_id: str
    use_web_search: bool = False
    use_deep_think: bool = False # ✅ 추가됨
    active_mcp_ids: List[str] = []
`,

  // 2. [Backend] 엔드포인트에서 파라미터 전달 수정
  "backend/app/api/endpoints/chat.py": `from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest
from app.services.rag_service import RAGService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

def get_rag_service():
    return RAGService()

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    service: RAGService = Depends(get_rag_service)
):
    return StreamingResponse(
        service.generate_response(
            message=request.message,
            kb_id=request.kb_id,
            user_id=current_user.id,
            use_web_search=request.use_web_search,
            use_deep_think=request.use_deep_think, # ✅ 전달
            active_mcp_ids=request.active_mcp_ids
        ),
        media_type="text/event-stream"
    )
`,

  // 3. [Backend] 서비스 로직에 조건문 적용
  "backend/app/services/rag_service.py": `import json
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
        
        self.llm = ChatOllama(model=settings.LLM_MODEL, temperature=0)
        self.web_search_tool = DuckDuckGoSearchRun()

    async def generate_response(
        self, 
        message: str, 
        kb_id: str, 
        user_id: int, 
        use_web_search: bool = False,
        use_deep_think: bool = False, # ✅ 파라미터 추가
        active_mcp_ids: Optional[List[str]] = None
    ) -> AsyncGenerator[str, None]:
        
        try:
            # [Router] 질문 의도 분석 (Deep Thinking이 켜져있거나, 모호할 때 수행)
            route = "rag"
            
            if use_deep_think: # ✅ 딥 씽킹 활성화 시에만 분석 과정 노출
                yield json.dumps({"type": "thinking", "thinking": "🤔 질문의 의도를 심층 분석하고 있습니다..."}) + "\\n"
                
                router_prompt = ChatPromptTemplate.from_template("""
                Analyze the user's question and choose the best processing mode.
                Question: {question}
                Options: 'process' (logistics/business execution), 'search' (real-time info), 'rag' (documents), 'chat' (general).
                Answer (process/search/rag/chat):
                """)
                router_chain = router_prompt | self.llm | StrOutputParser()
                route_result = await router_chain.ainvoke({"question": message})
                route = route_result.strip().lower()
                
                yield json.dumps({"type": "thinking", "thinking": f"🧭 분석 결과: '{route}' 모드로 전략을 수립합니다."}) + "\\n"
            
            else:
                # 딥 씽킹 꺼져있으면 단순 키워드 매칭으로 빠르게 처리
                if use_web_search: route = "search"
                elif any(k in message for k in ["배차", "주문", "루트", "지시"]): route = "process"
                else: route = "rag"

            # --- [MODE 1] xLAM Process Execution ---
            if "process" in route:
                yield json.dumps({"type": "thinking", "thinking": "🚀 xLAM 자율 에이전트 모드로 전환합니다."}) + "\\n"
                async for chunk in self.xlam_service.run_pipeline(message, kb_id, user_id):
                    yield chunk
                return

            context_text = ""
            
            # --- [MODE 2] Web Search ---
            if "search" in route:
                if use_deep_think: yield json.dumps({"type": "thinking", "thinking": "🌐 웹 검색을 실행하여 정보를 수집합니다..."}) + "\\n"
                try:
                    res = self.web_search_tool.invoke(message)
                    context_text = f"[Web Search Result]\\n{res}"
                except:
                    context_text = "검색 실패"
                    
            # --- [MODE 3] RAG (Document Search) ---
            else:
                if use_deep_think: yield json.dumps({"type": "thinking", "thinking": f"🔍 지식 베이스({kb_id})에서 관련 문서를 탐색 중..."}) + "\\n"
                retriever = self.vector_service.get_retriever(kb_id, user_id)
                docs = await retriever.ainvoke(message)
                if docs:
                    context_text = "\\n\\n".join([doc.page_content for doc in docs])
                    if use_deep_think: yield json.dumps({"type": "thinking", "thinking": f"✅ 문서 {len(docs)}개를 참조하여 답변을 구성합니다."}) + "\\n"
                else:
                    context_text = ""
                    if use_deep_think: yield json.dumps({"type": "thinking", "thinking": "❌ 관련 문서를 찾지 못했습니다."}) + "\\n"

            # 답변 생성
            prompt = ChatPromptTemplate.from_template("""
            [문맥]
            {context}
            [질문]
            {question}
            답변해주세요:
            """)
            chain = prompt | self.llm
            full_response = ""
            async for chunk in chain.astream({"context": context_text, "question": message}):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                full_response += content
                yield json.dumps({"type": "content", "content": content}) + "\\n"

            # [Self-Correction] 자기 검증 (Deep Thinking 켜져있을 때만)
            if use_deep_think and len(full_response) > 50:
                yield json.dumps({"type": "thinking", "thinking": "🛡️ 답변의 정확성을 자체 검증(Self-Reflection) 중..."}) + "\\n"
                reflection_prompt = ChatPromptTemplate.from_template("""
                Question: {question}
                Answer: {answer}
                Rate the answer's accuracy (0-100). Output only the number.
                """)
                score = await (reflection_prompt | self.llm | StrOutputParser()).ainvoke({"question": message, "answer": full_response})
                try:
                    if int(''.join(filter(str.isdigit, score))) > 80:
                         yield json.dumps({"type": "thinking", "thinking": "✨ 검증 완료: 신뢰도 높음"}) + "\\n"
                except: pass

        except Exception as e:
            import traceback
            print(traceback.format_exc())
            yield json.dumps({"type": "content", "content": f"Error: {str(e)}"}) + "\\n"
`,

  // 4. [Frontend] API Client에서 useDeepThink 전송
  "frontend/src/api/client.js": `import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api/v1';

const getAuthHeader = () => {
  const token = localStorage.getItem('rag_token');
  return token ? { 'Authorization': \`Bearer \${token}\` } : {};
};

// use_deep_think 파라미터 추가
export const streamChat = async ({ query, model, kb_id, web_search, use_deep_think, active_mcp_ids }, onChunk, onComplete) => {
  try {
    const response = await fetch(\`\${API_BASE_URL}/chat/stream\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({
        message: query,
        kb_id: kb_id || "default_kb",
        use_web_search: web_search || false,
        use_deep_think: use_deep_think || false, // ✅ 전송
        active_mcp_ids: active_mcp_ids || []
      })
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("로그인이 필요합니다.");
      throw new Error(\`Network response was not ok: \${response.status}\`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop(); 

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const jsonStr = line.startsWith('"') && line.endsWith('"') ? JSON.parse(line) : line;
          const data = typeof jsonStr === 'object' ? jsonStr : JSON.parse(jsonStr);
          onChunk(data);
        } catch (e) { console.error("Parse Error:", e); }
      }
    }
    if (onComplete) onComplete();

  } catch (error) {
    console.error("Stream Error:", error);
    onChunk({ type: 'content', content: \`\\n[Error] \${error.message}\` });
    if (onComplete) onComplete();
  }
};

export const uploadFileToBackend = async (file, kbId, chunkSize, chunkOverlap) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kb_id', kbId || "default_kb");
  if (chunkSize) formData.append('chunk_size', chunkSize);
  if (chunkOverlap) formData.append('chunk_overlap', chunkOverlap);

  const response = await fetch(\`\${API_BASE_URL}/knowledge/upload\`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Upload failed");
  }
  return await response.json();
};
`,
};

function fixDeepThink() {
  console.log("🚀 Deep Thinking 연결 복구 중...");
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(rootDir, relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content.trim(), "utf8");
    console.log(`✅ 수정됨: ${relPath}`);
  }
  console.log(
    "\\n🎉 연결 완료! 백엔드를 재시작하면 'Deep Thinking' 버튼이 작동합니다."
  );
}

fixDeepThink();
