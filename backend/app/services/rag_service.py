"""
RAG 서비스
- 질문 의도 분석 (Router)
- 컨텍스트 검색 (Vector DB)
- LLM 응답 생성
- 웹 검색 통합 (DuckDuckGo / Serper)
- Redis 캐싱
- Reranking (임베딩 기반)
- MCP 도구 통합
"""
import json
import os
import hashlib
import logging
from functools import lru_cache
from typing import AsyncGenerator, List, Optional

import numpy as np
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.tools import DuckDuckGoSearchRun

from app.core.config import settings
from app.services.vector_store import get_vector_store_service
from app.services.cache_service import get_cache_service
from app.services.graph_store import get_graph_store_service
from app.services.retriever_factory import get_retriever_factory

logger = logging.getLogger(__name__)


class RAGService:
    """RAG 파이프라인 서비스 (싱글톤)"""

    _instance: Optional["RAGService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if RAGService._initialized:
            return
        RAGService._initialized = True

        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
        self.vector_service = get_vector_store_service()
        self.cache_service = get_cache_service()
        self.web_search_tool = DuckDuckGoSearchRun()
        self.default_model = settings.LLM_MODEL
        self.default_top_k = settings.RAG_TOP_K
        logger.info("RAGService initialized (singleton)")

    def _get_cache_key(self, query: str, kb_ids: List[str], user_id: int) -> str:
        """캐시 키 생성 (kb_ids 정렬하여 일관성 보장)"""
        sorted_ids = ",".join(sorted(kb_ids))
        combined = f"{query}:{sorted_ids}:{user_id}"
        return f"rag:{hashlib.md5(combined.encode()).hexdigest()[:16]}"

    async def _get_cached_context(self, query: str, kb_ids: List[str], user_id: int) -> Optional[str]:
        """캐시된 컨텍스트 조회"""
        if not settings.CACHE_ENABLED:
            return None

        key = self._get_cache_key(query, kb_ids, user_id)
        cached = await self.cache_service.get(key)
        if cached:
            logger.debug(f"Cache hit for query: {query[:50]}...")
            return cached
        return None

    async def _cache_context(self, query: str, kb_ids: List[str], user_id: int, context: str):
        """컨텍스트 캐싱"""
        if not settings.CACHE_ENABLED or not context:
            return

        key = self._get_cache_key(query, kb_ids, user_id)
        await self.cache_service.set(key, context, ttl=settings.CACHE_TTL_SECONDS)
        logger.debug(f"Cached context for query: {query[:50]}...")

    async def generate_response(
        self,
        message: str,
        kb_ids: List[str],
        user_id: int,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        history: Optional[List[dict]] = None,
        use_web_search: bool = False,
        use_deep_think: bool = False,
        active_mcp_ids: Optional[List[str]] = None,
        top_k: Optional[int] = None,
        use_rerank: bool = False,
        search_provider: Optional[str] = None,
        use_sql: bool = False,
        db_connection_id: Optional[str] = None,
        db=None,
    ) -> AsyncGenerator[str, None]:
        """
        RAG 파이프라인 실행 및 스트리밍 응답 생성

        Args:
            message: 사용자 질문
            kb_ids: 지식 베이스 ID 목록 (다중 선택)
            user_id: 사용자 ID
            model: 사용할 LLM 모델
            system_prompt: 에이전트 시스템 프롬프트
            history: 이전 대화 기록 [{role, content}, ...]
            use_web_search: 웹 검색 사용 여부
            use_deep_think: 딥 씽킹 모드
            active_mcp_ids: 활성화된 MCP 도구 ID 목록
            top_k: 검색 결과 개수 (None이면 서버 기본값)
            use_rerank: Rerank 사용 여부
            search_provider: 검색 공급자 (ddg, serper)
        """
        try:
            effective_top_k = top_k or self.default_top_k

            # 1. 모델 결정 (프론트 요청 > 환경변수)
            target_model = model if model else self.default_model

            # 매 요청마다 모델을 새로 초기화 (다이나믹 모델 스위칭)
            llm = ChatOllama(
                model=target_model,
                temperature=settings.LLM_TEMPERATURE
            )

            # 2. MCP 도구 컨텍스트 수집
            tool_context = ""
            if active_mcp_ids:
                tool_context = await self._execute_mcp_tools(message, active_mcp_ids, use_deep_think, user_id, db)
                if use_deep_think and tool_context:
                    yield json.dumps({
                        "type": "thinking",
                        "thinking": "MCP 도구 실행 결과를 답변에 반영합니다."
                    }) + "\n"

            # 3. 질문 의도 분석 (Router)
            route = await self._analyze_intent(message, llm, use_web_search, use_deep_think)

            # Deep Think 모드일 때 분석 결과 전송
            if use_deep_think:
                yield json.dumps({
                    "type": "thinking",
                    "thinking": f"분석 결과: '{route}' 모드로 전략 수립"
                }) + "\n"

            # 4. 라우팅에 따른 처리
            # --- [MODE 1] xLAM Process ---
            if route == "process":
                yield json.dumps({
                    "type": "thinking",
                    "thinking": "xLAM 자율 에이전트 모드로 전환합니다."
                }) + "\n"
                # 순환 임포트 방지
                from app.services.xlam_service import get_xlam_service
                xlam_service = get_xlam_service()
                async for chunk in xlam_service.run_pipeline(message, kb_ids[0], user_id, db=db):
                    yield chunk
                return

            # --- [MODE 4] Text-to-SQL ---
            if use_sql and db_connection_id:
                yield json.dumps({
                    "type": "thinking",
                    "thinking": "Text-to-SQL 모드로 전환합니다."
                }) + "\n"
                from app.services.t2sql_service import get_t2sql_service
                from app.api.endpoints.settings import get_db_connection_for_user, _build_connection_uri

                conn = await get_db_connection_for_user(user_id, db_connection_id)
                if not conn:
                    yield json.dumps({
                        "type": "content",
                        "content": "데이터베이스 연결을 찾을 수 없습니다. 설정에서 DB 연결을 확인해주세요."
                    }) + "\n"
                    return

                uri = _build_connection_uri(conn)
                t2sql = get_t2sql_service()
                async for chunk in t2sql.generate_and_execute(message, uri, model=target_model):
                    yield chunk
                return

            # 5. 컨텍스트 수집
            context_text = ""

            # --- [MODE 2] Web Search ---
            if route == "search":
                provider = search_provider or "ddg"
                context_text = await self._web_search(message, provider, user_id)
                if use_deep_think and context_text:
                    provider_labels = {"ddg": "DuckDuckGo", "serper": "Google Serper", "brave": "Brave Search", "tavily": "Tavily"}
                    provider_label = provider_labels.get(provider, provider)
                    yield json.dumps({
                        "type": "thinking",
                        "thinking": f"{provider_label} 웹 검색 결과를 기반으로 답변 생성 중..."
                    }) + "\n"

            # --- [MODE 3] RAG ---
            else:
                kb_label = ", ".join(kb_ids) if len(kb_ids) <= 3 else f"{len(kb_ids)}개 KB"
                if use_deep_think:
                    yield json.dumps({
                        "type": "thinking",
                        "thinking": f"지식 베이스({kb_label})에서 관련 문서를 탐색 중... (Top-{effective_top_k})"
                    }) + "\n"

                context_text = await self._retrieve_context(
                    message, kb_ids, user_id,
                    top_k=effective_top_k,
                    use_rerank=use_rerank,
                    db=db,
                )

                if context_text:
                    doc_count = context_text.count("\n\n") + 1
                    rerank_label = " (Reranked)" if use_rerank else ""
                    graph_label = " + Graph" if "[Knowledge Graph Context]" in context_text else ""
                    if use_deep_think:
                        yield json.dumps({
                            "type": "thinking",
                            "thinking": f"문서 {doc_count}개를 참조하여 답변 구성{rerank_label}{graph_label}"
                        }) + "\n"
                elif use_deep_think:
                    yield json.dumps({
                        "type": "thinking",
                        "thinking": "관련 문서를 찾지 못했습니다."
                    }) + "\n"

            # MCP 도구 결과가 있으면 컨텍스트에 추가
            if tool_context:
                context_text = f"{context_text}\n\n[도구 실행 결과]\n{tool_context}" if context_text else f"[도구 실행 결과]\n{tool_context}"

            # 6. 답변 생성
            full_response = ""
            async for chunk in self._generate_answer(message, context_text, llm, system_prompt, history):
                full_response += chunk
                yield json.dumps({"type": "content", "content": chunk}) + "\n"

            # 7. 자기 검증 (Deep Thinking ON일 때만)
            if use_deep_think and len(full_response) > 50:
                async for thinking in self._self_reflection(message, full_response, llm):
                    yield thinking

        except Exception as e:
            logger.error(f"RAG generation error: {e}", exc_info=True)
            yield json.dumps({
                "type": "content",
                "content": f"오류가 발생했습니다: {str(e)}"
            }) + "\n"

    async def _analyze_intent(
        self,
        message: str,
        llm: ChatOllama,
        use_web_search: bool,
        use_deep_think: bool
    ) -> str:
        """질문 의도 분석"""
        # 딥 씽킹 꺼져있으면 키워드로 빠르게 판단
        if not use_deep_think:
            if use_web_search:
                return "search"
            keywords_process = ["배차", "주문", "루트", "지시", "배송", "물류"]
            if any(k in message for k in keywords_process):
                return "process"
            return "rag"

        # 딥 씽킹: LLM으로 의도 분석
        router_prompt = ChatPromptTemplate.from_template("""
        Analyze the user's question and choose the best processing mode.
        Question: {question}

        Modes:
        - 'process': Logistics/Business execution (dispatch, order, route, delivery).
        - 'search': Real-time info (weather, news, current events).
        - 'rag': Document/Manual based Q&A (internal knowledge).

        Return ONLY the mode name (process/search/rag).
        """)
        router_chain = router_prompt | llm | StrOutputParser()

        try:
            route_result = await router_chain.ainvoke({"question": message})
            route = route_result.strip().lower()
            if route in ["process", "search", "rag"]:
                return route
        except Exception as e:
            logger.warning(f"Router failed: {e}")

        return "rag"

    async def _web_search(self, query: str, provider: str = "ddg", user_id: int = 0) -> str:
        """웹 검색 수행 (DuckDuckGo / Serper / Brave / Tavily)"""
        if provider == "serper":
            return await self._api_search(query, "serper", user_id)
        elif provider == "brave":
            return await self._api_search(query, "brave", user_id)
        elif provider == "tavily":
            return await self._api_search(query, "tavily", user_id)

        # 기본: DuckDuckGo (API 키 불필요)
        try:
            result = self.web_search_tool.invoke(query)
            return f"[Web Search Result - DuckDuckGo]\n{result}"
        except Exception as e:
            logger.warning(f"DuckDuckGo search failed: {e}")
            return ""

    async def _api_search(self, query: str, provider: str, user_id: int = 0) -> str:
        """API 키 기반 웹 검색 (Serper / Brave / Tavily)"""
        from app.api.endpoints.settings import get_api_key_for_user
        api_key = await get_api_key_for_user(user_id, provider) if user_id else None
        if not api_key:
            logger.warning(f"{provider} API key not found, falling back to DuckDuckGo")
            try:
                result = self.web_search_tool.invoke(query)
                return f"[Web Search Result - DuckDuckGo ({provider} 키 없음)]\n{result}"
            except Exception:
                return ""

        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                if provider == "serper":
                    resp = await client.post(
                        "https://google.serper.dev/search",
                        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                        json={"q": query, "num": 5}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        results = []
                        for item in data.get("organic", [])[:5]:
                            results.append(f"- {item.get('title', '')}: {item.get('snippet', '')} ({item.get('link', '')})")
                        if results:
                            return "[Web Search Result - Google Serper]\n" + "\n".join(results)

                elif provider == "brave":
                    resp = await client.get(
                        "https://api.search.brave.com/res/v1/web/search",
                        headers={"Accept": "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": api_key},
                        params={"q": query, "count": 5}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        results = []
                        for item in data.get("web", {}).get("results", [])[:5]:
                            results.append(f"- {item.get('title', '')}: {item.get('description', '')} ({item.get('url', '')})")
                        if results:
                            return "[Web Search Result - Brave Search]\n" + "\n".join(results)

                elif provider == "tavily":
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={"api_key": api_key, "query": query, "max_results": 5, "search_depth": "basic"}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        results = []
                        for item in data.get("results", [])[:5]:
                            results.append(f"- {item.get('title', '')}: {item.get('content', '')[:200]} ({item.get('url', '')})")
                        if results:
                            return "[Web Search Result - Tavily]\n" + "\n".join(results)

                logger.warning(f"{provider} API error: {resp.status_code}")
                return ""

        except Exception as e:
            logger.warning(f"{provider} search failed: {e}")
            return ""

    async def _retrieve_context(
        self,
        query: str,
        kb_ids: List[str],
        user_id: int,
        top_k: int = 4,
        use_rerank: bool = False,
        db=None,
    ) -> str:
        """벡터 DB에서 컨텍스트 검색 (다중 KB, 캐시 적용, Rerank)"""
        # 캐시 확인
        cached = await self._get_cached_context(query, kb_ids, user_id)
        if cached:
            return cached

        # 각 KB에서 벡터 검색 후 합침 (RetrieverFactory로 다중 소스 지원)
        all_docs = []
        factory = get_retriever_factory()
        for kb_id in kb_ids:
            try:
                retriever = await factory.get_retriever(user_id, kb_id, top_k, db)
                docs = await retriever.ainvoke(query)
                all_docs.extend(docs)
            except Exception as e:
                logger.warning(f"Retrieval from KB '{kb_id}' failed: {e}")

        if not all_docs:
            return ""

        # 중복 제거 (내용 해시 기반)
        seen = set()
        unique_docs = []
        for doc in all_docs:
            content_key = doc.page_content[:200]
            if content_key not in seen:
                seen.add(content_key)
                unique_docs.append(doc)

        # Rerank: 임베딩 유사도 기반 재정렬
        if use_rerank and len(unique_docs) > 1:
            try:
                unique_docs = self._rerank_documents(query, unique_docs, top_k)
                logger.debug(f"Reranked {len(unique_docs)} documents")
            except Exception as e:
                logger.warning(f"Rerank failed, using original order: {e}")

        # top_k로 제한
        final_docs = unique_docs[:top_k]

        context_text = "\n\n".join([doc.page_content for doc in final_docs])

        # 그래프 컨텍스트 추가
        graph_context = self._get_graph_context(query, kb_ids, user_id)
        if graph_context:
            context_text = f"{context_text}\n\n[Knowledge Graph Context]\n{graph_context}"

        # 캐시 저장
        await self._cache_context(query, kb_ids, user_id, context_text)
        return context_text

    def _rerank_documents(self, query: str, docs: list, top_k: int) -> list:
        """임베딩 유사도 기반으로 문서 재정렬"""
        query_embedding = np.array(
            self.vector_service.embeddings.embed_query(query)
        )
        doc_texts = [doc.page_content for doc in docs]
        doc_embeddings = np.array(
            self.vector_service.embeddings.embed_documents(doc_texts)
        )

        # 코사인 유사도 계산
        query_norm = np.linalg.norm(query_embedding)
        doc_norms = np.linalg.norm(doc_embeddings, axis=1)

        # 0으로 나누기 방지
        safe_norms = np.where(doc_norms == 0, 1, doc_norms)
        scores = doc_embeddings @ query_embedding / (safe_norms * query_norm)

        # 점수 기준 내림차순 정렬
        ranked_indices = np.argsort(scores)[::-1][:top_k]
        return [docs[i] for i in ranked_indices]

    def _get_graph_context(self, query: str, kb_ids: List[str], user_id: int) -> str:
        """각 KB에서 그래프 컨텍스트를 수집하여 합침"""
        try:
            graph_service = get_graph_store_service()
            if not graph_service.ensure_connection():
                return ""

            all_context = []
            for kb_id in kb_ids:
                ctx = graph_service.get_graph_context(query, kb_id, user_id)
                if ctx:
                    all_context.append(ctx)

            return "\n".join(all_context) if all_context else ""
        except Exception as e:
            logger.debug(f"Graph context retrieval skipped: {e}")
            return ""

    async def _execute_mcp_tools(
        self,
        message: str,
        active_mcp_ids: List[str],
        use_deep_think: bool,
        user_id: int = None,
        db=None,
    ) -> str:
        """MCP 도구 실행 (내장 + MCP 서버 도구)"""
        if not active_mcp_ids:
            return ""

        from app.services.tool_registry import ToolRegistry

        # DB에서 사용자의 MCP 서버 설정 조회
        mcp_configs = []
        if db and user_id:
            try:
                from sqlalchemy import select
                from app.models.mcp_server import McpServer
                stmt = select(McpServer).where(
                    McpServer.user_id == user_id,
                    McpServer.enabled == True,
                )
                result = await db.execute(stmt)
                servers = result.scalars().all()
                mcp_configs = [
                    {
                        "server_id": s.server_id,
                        "server_type": s.server_type,
                        "url": s.url,
                        "command": s.command,
                        "headers_json": s.headers_json,
                    }
                    for s in servers
                ]
            except Exception as e:
                logger.warning(f"MCP 서버 설정 조회 실패: {e}")

        # 비동기 도구 조회 (내장 + MCP)
        tools = await ToolRegistry.get_tools_async(active_mcp_ids, mcp_configs)
        if not tools:
            logger.debug(f"No tools found for IDs: {active_mcp_ids}")
            return ""

        results = []
        for t in tools:
            try:
                tool_name = getattr(t, 'name', str(t))
                logger.info(f"Executing tool: {tool_name}")
                result = await t.ainvoke(message)
                if result:
                    results.append(f"[{tool_name}] {result}")
            except Exception as e:
                logger.warning(f"Tool execution failed ({t}): {e}")

        return "\n".join(results) if results else ""

    def _build_history_text(self, history: Optional[List[dict]]) -> str:
        """대화 히스토리를 텍스트로 변환"""
        if not history:
            return ""
        lines = []
        for msg in history[-10:]:  # 최근 10턴만 사용
            role = "사용자" if msg["role"] == "user" else "AI"
            lines.append(f"{role}: {msg['content'][:500]}")
        return "\n".join(lines)

    async def _generate_answer(
        self,
        question: str,
        context: str,
        llm: ChatOllama,
        system_prompt: Optional[str] = None,
        history: Optional[List[dict]] = None
    ) -> AsyncGenerator[str, None]:
        """LLM으로 답변 생성 (시스템 프롬프트 + 대화 기록 지원)"""
        history_text = self._build_history_text(history)

        # 시스템 프롬프트 기본값
        sys_prompt = system_prompt or "당신은 정확한 근거를 바탕으로 답변하는 AI 어시스턴트입니다."

        # 동적으로 프롬프트 구성
        template_parts = [sys_prompt, ""]

        if history_text:
            template_parts.append("[이전 대화]\n{history}\n")

        if context:
            template_parts.append("[참고 문맥]\n{context}\n")

        template_parts.append("[질문]\n{question}\n\n답변:")

        template = "\n".join(template_parts)
        prompt = ChatPromptTemplate.from_template(template)
        chain = prompt | llm

        async for chunk in chain.astream({
            "context": context,
            "question": question,
            "history": history_text
        }):
            content = chunk.content if hasattr(chunk, 'content') else str(chunk)
            if content:
                yield content

    async def _self_reflection(
        self,
        question: str,
        answer: str,
        llm: ChatOllama
    ) -> AsyncGenerator[str, None]:
        """자기 검증 (Self-Reflection)"""
        yield json.dumps({
            "type": "thinking",
            "thinking": "답변의 정확성을 자체 검증(Self-Reflection) 중..."
        }) + "\n"

        reflection_prompt = ChatPromptTemplate.from_template("""
Question: {question}
Answer: {answer}

Rate the answer's accuracy and completeness on a scale of 0-100.
Output ONLY the number.
""")

        try:
            score = await (reflection_prompt | llm | StrOutputParser()).ainvoke({
                "question": question,
                "answer": answer
            })
            score_digits = ''.join(filter(str.isdigit, score))
            if score_digits:
                score_num = min(100, int(score_digits[:3]))
                if score_num >= 80:
                    yield json.dumps({
                        "type": "thinking",
                        "thinking": f"검증 완료: 신뢰도 높음 ({score_num}점)"
                    }) + "\n"
                elif score_num >= 50:
                    yield json.dumps({
                        "type": "thinking",
                        "thinking": f"검증 완료: 신뢰도 보통 ({score_num}점)"
                    }) + "\n"
        except Exception as e:
            logger.debug(f"Self-reflection failed: {e}")


@lru_cache()
def get_rag_service() -> RAGService:
    """싱글톤 RAGService 인스턴스 반환"""
    return RAGService()
