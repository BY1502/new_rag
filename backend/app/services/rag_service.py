"""
RAG 서비스
- 질문 의도 분석 (Router)
- 컨텍스트 검색 (Vector DB)
- LLM 응답 생성
- 웹 검색 통합 (DuckDuckGo / Serper)
- Redis 캐싱
- Reranking (임베딩 기반)
- MCP 도구 통합
- 멀티 Provider LLM 지원 (Ollama, OpenAI, Anthropic, Google)
"""
import json
import os
import hashlib
import logging
from functools import lru_cache
from typing import AsyncGenerator, List, Optional, Any

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

        try:
            os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL
            self.vector_service = get_vector_store_service()
            self.cache_service = get_cache_service()
            try:
                self.web_search_tool = DuckDuckGoSearchRun()
            except Exception as e:
                logger.warning(f"DuckDuckGoSearchRun 초기화 실패 (무시): {e}")
                self.web_search_tool = None
            self.default_model = settings.LLM_MODEL
            self.default_top_k = settings.RAG_TOP_K
            RAGService._initialized = True
            logger.info("RAGService initialized (singleton)")
        except Exception as e:
            logger.error(f"RAGService 초기화 실패: {e}", exc_info=True)
            # 최소한의 기본값 설정하여 부분 동작 보장
            self.default_model = getattr(settings, 'LLM_MODEL', 'gemma3:27b')
            self.default_top_k = getattr(settings, 'RAG_TOP_K', 5)
            self.web_search_tool = None
            if not hasattr(self, 'vector_service'):
                self.vector_service = None
            if not hasattr(self, 'cache_service'):
                self.cache_service = None
            RAGService._initialized = True
            logger.warning("RAGService 부분 초기화됨 (일부 기능 제한)")

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

    def _detect_provider(self, model_name: str) -> str:
        """
        모델명으로 provider 자동 감지

        Returns:
            "openai" | "anthropic" | "google" | "groq" | "ollama"
        """
        model_lower = model_name.lower()

        # OpenAI 모델
        if any(prefix in model_lower for prefix in ["gpt-", "o1-", "text-davinci", "text-embedding"]):
            return "openai"

        # Anthropic 모델
        if "claude" in model_lower:
            return "anthropic"

        # Google 모델
        if any(prefix in model_lower for prefix in ["gemini", "palm", "bison"]):
            return "google"

        # Groq 모델 (Groq 호스팅 오픈소스 모델)
        if any(prefix in model_lower for prefix in ["llama-", "mixtral-", "llama3"]) and "versatile" in model_lower or "instant" in model_lower or "32768" in model_lower:
            return "groq"

        # 기본값: Ollama (로컬 모델)
        return "ollama"

    async def _get_llm_instance(self, model_name: str, user_id: int, db=None) -> Any:
        """
        모델명과 사용자 ID를 기반으로 적절한 LLM 인스턴스 생성

        Provider별로:
        - OpenAI: langchain-openai의 ChatOpenAI
        - Anthropic: langchain-anthropic의 ChatAnthropic
        - Google: langchain-google-genai의 ChatGoogleGenerativeAI
        - Ollama: langchain-ollama의 ChatOllama (기본)

        API 키는 DB에서 동적으로 로드됩니다.
        """
        provider = self._detect_provider(model_name)
        temperature = settings.LLM_TEMPERATURE
        logger.info(f"[LLM] model={model_name}, provider={provider}, user={user_id}")

        # Ollama (로컬 모델)
        if provider == "ollama":
            return ChatOllama(model=model_name, temperature=temperature, timeout=120)

        # 외부 API: DB에서 API 키 조회
        if db is None:
            logger.warning(f"[LLM] DB 세션 없음 - {provider} API 키를 가져올 수 없습니다. Ollama로 폴백.")
            return ChatOllama(model=model_name, temperature=temperature)

        try:
            from app.crud.api_key import get_api_key_for_user, get_api_keys_for_user
            from app.core.encryption import decrypt_value

            # provider 이름으로 직접 조회, 없으면 부분 매칭 시도
            # (프론트엔드에서 'google gemini'로 저장될 수 있음)
            api_key_row = await get_api_key_for_user(db, user_id, provider)
            if not api_key_row:
                # 부분 매칭: 'google' → 'google gemini' 등
                all_keys = await get_api_keys_for_user(db, user_id)
                for row in all_keys:
                    if provider in row.provider or row.provider in provider:
                        api_key_row = row
                        break

            if not api_key_row:
                logger.warning(f"[LLM] {provider} API 키가 등록되지 않았습니다. Ollama로 폴백.")
                return ChatOllama(model=self.default_model, temperature=temperature, timeout=120)

            # API 키 복호화
            api_key = decrypt_value(api_key_row.encrypted_key)

            # Provider별 LLM 인스턴스 생성
            if provider == "openai":
                try:
                    from langchain_openai import ChatOpenAI
                    logger.info(f"[LLM] OpenAI 모델 초기화: {model_name}")
                    return ChatOpenAI(
                        model=model_name,
                        temperature=temperature,
                        api_key=api_key,
                        streaming=True,
                        request_timeout=120
                    )
                except ImportError:
                    logger.error("[LLM] langchain-openai 설치 필요: pip install langchain-openai")
                    raise

            elif provider == "anthropic":
                try:
                    from langchain_anthropic import ChatAnthropic
                    logger.info(f"[LLM] Anthropic 모델 초기화: {model_name}")
                    return ChatAnthropic(
                        model=model_name,
                        temperature=temperature,
                        api_key=api_key,
                        streaming=True,
                        timeout=120.0
                    )
                except ImportError:
                    logger.error("[LLM] langchain-anthropic 설치 필요: pip install langchain-anthropic")
                    raise

            elif provider == "google":
                try:
                    from langchain_google_genai import ChatGoogleGenerativeAI
                    logger.info(f"[LLM] Google 모델 초기화: {model_name}")
                    return ChatGoogleGenerativeAI(
                        model=model_name,
                        temperature=temperature,
                        google_api_key=api_key,
                        streaming=True,
                        timeout=120
                    )
                except ImportError:
                    logger.error("[LLM] langchain-google-genai 설치 필요: pip install langchain-google-genai")
                    raise

            elif provider == "groq":
                try:
                    from langchain_openai import ChatOpenAI
                    logger.info(f"[LLM] Groq 모델 초기화: {model_name}")
                    return ChatOpenAI(
                        model=model_name,
                        temperature=temperature,
                        api_key=api_key,
                        base_url="https://api.groq.com/openai/v1",
                        streaming=True,
                        request_timeout=120
                    )
                except ImportError:
                    logger.error("[LLM] langchain-openai 설치 필요: pip install langchain-openai")
                    raise

        except Exception as e:
            logger.error(f"[LLM] {provider} 초기화 실패: {e}. Ollama로 폴백.")
            return ChatOllama(model=self.default_model, temperature=temperature, timeout=120)

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
        search_mode: str = "hybrid",
        dense_weight: float = 0.5,
        images: Optional[List[str]] = None,
        use_sql: bool = False,
        db_connection_id: Optional[str] = None,
        use_multimodal_search: bool = False,
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
            search_mode: 검색 모드 (dense, sparse, hybrid)
        """
        try:
            effective_top_k = top_k or self.default_top_k

            # 1. 모델 결정 (프론트 요청 > 환경변수)
            target_model = model if model else self.default_model
            logger.info(f"[RAG] model={target_model}, use_sql={use_sql}, db_conn={db_connection_id}, user={user_id}")

            # 매 요청마다 모델을 새로 초기화 (다이나믹 모델 스위칭)
            llm = await self._get_llm_instance(target_model, user_id, db)
            logger.info(f"[RAG] LLM instance: {type(llm).__name__}")

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
            logger.info(f"[RAG] route={route}")

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
                xlam_llm = await self._get_llm_instance(target_model, user_id, db)
                async for chunk in xlam_service.run_pipeline(message, kb_ids[0], user_id, db=db, llm_instance=xlam_llm):
                    yield chunk
                return

            # --- [MODE 4] Text-to-SQL ---
            if use_sql and db_connection_id:
                logger.info(f"[T2SQL] mode activated: conn={db_connection_id}, model={target_model}")
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
                t2sql_llm = await self._get_llm_instance(target_model, user_id, db)
                logger.info(f"[T2SQL] LLM={type(t2sql_llm).__name__}, executing...")
                async for chunk in t2sql.generate_and_execute(message, uri, model=target_model, llm_instance=t2sql_llm):
                    yield chunk
                logger.info("[T2SQL] completed")
                return

            # 5. 컨텍스트 수집
            context_text = ""

            # --- [MODE 2] Web Search ---
            if route == "search":
                provider = search_provider or "ddg"
                provider_labels = {"ddg": "DuckDuckGo", "serper": "Google Serper", "brave": "Brave Search", "tavily": "Tavily"}
                provider_label = provider_labels.get(provider, provider)

                yield json.dumps({
                    "type": "thinking",
                    "thinking": f"{provider_label} 웹 검색 중..."
                }) + "\n"

                context_text = await self._web_search(message, provider, user_id)

                if context_text.startswith("[Web Search Failed]"):
                    # 검색 실패 시 사용자에게 알림
                    yield json.dumps({
                        "type": "thinking",
                        "thinking": f"웹 검색 실패: {context_text.replace('[Web Search Failed] ', '')}"
                    }) + "\n"
                elif context_text:
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
                    search_mode=search_mode,
                    dense_weight=dense_weight,
                    use_multimodal_search=use_multimodal_search,
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
            async for chunk in self._generate_answer(
                message, context_text, llm, system_prompt, history,
                images=images, model=target_model
            ):
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
            import asyncio as _asyncio
            route_result = await _asyncio.wait_for(
                router_chain.ainvoke({"question": message}),
                timeout=30
            )
            route = route_result.strip().lower()
            if route in ["process", "search", "rag"]:
                return route
        except _asyncio.TimeoutError:
            logger.warning("Router timeout (30s)")
        except Exception as e:
            logger.warning(f"Router failed: {e}")

        return "rag"

    async def _web_search(self, query: str, provider: str = "ddg", user_id: int = 0) -> str:
        """웹 검색 수행 (DuckDuckGo / Serper / Brave / Tavily)"""
        import asyncio as _asyncio

        if provider == "serper":
            return await self._api_search(query, "serper", user_id)
        elif provider == "brave":
            return await self._api_search(query, "brave", user_id)
        elif provider == "tavily":
            return await self._api_search(query, "tavily", user_id)

        # 기본: DuckDuckGo (API 키 불필요)
        if not self.web_search_tool:
            logger.warning("DuckDuckGo search tool not available")
            return "[Web Search Failed] DuckDuckGo 검색 도구를 사용할 수 없습니다."
        try:
            # DuckDuckGoSearchRun.invoke()는 동기 함수이므로 run_in_executor로 비동기 실행
            loop = _asyncio.get_running_loop()
            result = await _asyncio.wait_for(
                loop.run_in_executor(None, self.web_search_tool.invoke, query),
                timeout=15
            )
            if not result or not result.strip():
                logger.warning("DuckDuckGo returned empty result")
                return "[Web Search Failed] DuckDuckGo 검색 결과가 없습니다."
            return f"[Web Search Result - DuckDuckGo]\n{result}"
        except _asyncio.TimeoutError:
            logger.warning("DuckDuckGo search timed out (15s)")
            return "[Web Search Failed] DuckDuckGo 검색 시간이 초과되었습니다."
        except Exception as e:
            logger.warning(f"DuckDuckGo search failed: {e}")
            return f"[Web Search Failed] DuckDuckGo 검색 실패: {str(e)}"

    async def _api_search(self, query: str, provider: str, user_id: int = 0) -> str:
        """API 키 기반 웹 검색 (Serper / Brave / Tavily)"""
        import asyncio as _asyncio

        from app.api.endpoints.settings import get_api_key_for_user
        api_key = await get_api_key_for_user(user_id, provider) if user_id else None
        if not api_key:
            logger.warning(f"{provider} API key not found, falling back to DuckDuckGo")
            # DuckDuckGo 폴백 (동기 → run_in_executor)
            if self.web_search_tool:
                try:
                    loop = _asyncio.get_running_loop()
                    result = await _asyncio.wait_for(
                        loop.run_in_executor(None, self.web_search_tool.invoke, query),
                        timeout=15
                    )
                    if result and result.strip():
                        return f"[Web Search Result - DuckDuckGo ({provider} 키 없음)]\n{result}"
                except Exception as e:
                    logger.warning(f"DuckDuckGo fallback failed: {e}")
            return f"[Web Search Failed] {provider} API 키가 설정되지 않았습니다. 설정에서 API 키를 추가해주세요."

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
                return f"[Web Search Failed] {provider} API 오류 (HTTP {resp.status_code})"

        except Exception as e:
            logger.warning(f"{provider} search failed: {e}")
            return f"[Web Search Failed] {provider} 검색 실패: {str(e)}"

    async def _retrieve_context(
        self,
        query: str,
        kb_ids: List[str],
        user_id: int,
        top_k: int = 4,
        use_rerank: bool = False,
        search_mode: str = "hybrid",
        dense_weight: float = 0.5,
        use_multimodal_search: bool = False,
        db=None,
    ) -> str:
        """벡터 DB에서 컨텍스트 검색 (다중 KB, 캐시 적용, Rerank, 멀티모달)"""
        # 캐시 확인 (멀티모달일 때는 캐시 스킵)
        if not use_multimodal_search:
            cached = await self._get_cached_context(query, kb_ids, user_id)
            if cached:
                return cached

        all_docs = []

        # 멀티모달 검색 (CLIP)
        if use_multimodal_search:
            from app.services.clip_embeddings import get_clip_embeddings
            from app.services.vdb.qdrant_store import QdrantStore
            from app.services.qdrant_resolver import resolve_qdrant_client

            try:
                clip = get_clip_embeddings()
                query_vector = clip.embed_text_for_cross_modal(query)

                for kb_id in kb_ids:
                    try:
                        # Qdrant 클라이언트 resolve
                        ext_client = await resolve_qdrant_client(db, user_id, kb_id) if db else None
                        client = self.vector_service.get_client(ext_client)
                        collection_name = f"kb_{kb_id}"

                        if not client.collection_exists(collection_name):
                            logger.warning(f"Collection {collection_name} not found")
                            continue

                        # QdrantStore 인스턴스 생성
                        store = QdrantStore(
                            client=client,
                            collection_name=collection_name,
                            embeddings=self.vector_service.embeddings,
                            embedding_dimension=settings.EMBEDDING_DIMENSION,
                            user_id=user_id,
                        )

                        # 멀티모달 검색 (텍스트 + 이미지 모두)
                        docs = await store.multimodal_search(
                            query_vector=query_vector,
                            content_type_filter=None,  # 텍스트와 이미지 모두 검색
                            top_k=top_k
                        )
                        all_docs.extend(docs)

                    except Exception as e:
                        logger.warning(f"Multimodal retrieval from KB '{kb_id}' failed: {e}")

            except Exception as e:
                logger.error(f"Multimodal search failed: {e}, falling back to normal search")
                use_multimodal_search = False

        # 일반 검색 (BGE + BM25)
        if not use_multimodal_search:
            factory = get_retriever_factory()
            for kb_id in kb_ids:
                try:
                    retriever = await factory.get_retriever(user_id, kb_id, top_k, db, search_mode, dense_weight=dense_weight)
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

        # Rerank: 임베딩 유사도 기반 재정렬 (텍스트 문서만)
        if use_rerank and len(unique_docs) > 1:
            try:
                # 텍스트 문서만 rerank (이미지는 제외)
                text_docs = [d for d in unique_docs if d.metadata.get("content_type") != "image"]
                image_docs = [d for d in unique_docs if d.metadata.get("content_type") == "image"]

                if text_docs:
                    text_docs = self._rerank_documents(query, text_docs, top_k)
                    logger.debug(f"Reranked {len(text_docs)} text documents")

                unique_docs = text_docs + image_docs

            except Exception as e:
                logger.warning(f"Rerank failed, using original order: {e}")

        # top_k로 제한
        final_docs = unique_docs[:top_k]

        # 컨텍스트 텍스트 생성 (이미지는 표시만)
        context_parts = []
        for doc in final_docs:
            if doc.metadata.get("content_type") == "image":
                # 이미지 문서는 경로와 설명만 표시
                image_path = doc.metadata.get("image_path", "")
                image_name = doc.metadata.get("source", "unknown")
                context_parts.append(f"[이미지: {image_name}] (경로: {image_path})")
            else:
                # 텍스트 문서는 내용 표시
                context_parts.append(doc.page_content)

        context_text = "\n\n".join(context_parts)

        # 그래프 컨텍스트 추가
        graph_context = self._get_graph_context(query, kb_ids, user_id)
        if graph_context:
            context_text = f"{context_text}\n\n[Knowledge Graph Context]\n{graph_context}"

        # 캐시 저장 (멀티모달이 아닐 때만)
        if not use_multimodal_search:
            await self._cache_context(query, kb_ids, user_id, context_text)

        return context_text

    def _rerank_documents(self, query: str, docs: list, top_k: int) -> list:
        """Cross-Encoder 기반 문서 리랭킹 (폴백: 임베딩 유사도)"""
        from app.services.reranker import get_reranker_service

        reranker = get_reranker_service()
        if reranker.is_available:
            return reranker.rerank(query, docs, top_k)

        # Cross-Encoder 사용 불가 시 임베딩 유사도 폴백
        logger.debug("Cross-Encoder 미사용 — 임베딩 유사도 기반 리랭킹")
        query_embedding = np.array(
            self.vector_service.embeddings.embed_query(query)
        )
        doc_texts = [doc.page_content for doc in docs]
        doc_embeddings = np.array(
            self.vector_service.embeddings.embed_documents(doc_texts)
        )

        query_norm = np.linalg.norm(query_embedding)
        doc_norms = np.linalg.norm(doc_embeddings, axis=1)
        safe_norms = np.where(doc_norms == 0, 1, doc_norms)
        scores = doc_embeddings @ query_embedding / (safe_norms * query_norm)

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

    # 한국어 특화 모델 식별
    KOREAN_MODEL_PREFIXES = ("exaone", "eeve", "bllossom", "kullm", "ko-", "korean")

    @staticmethod
    def _is_korean_model(model_name: str) -> bool:
        """한국어 특화 모델 여부 판별"""
        if not model_name:
            return False
        lower = model_name.lower()
        return any(lower.startswith(p) or p in lower for p in RAGService.KOREAN_MODEL_PREFIXES)

    async def _generate_answer(
        self,
        question: str,
        context: str,
        llm: ChatOllama,
        system_prompt: Optional[str] = None,
        history: Optional[List[dict]] = None,
        images: Optional[List[str]] = None,
        model: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """LLM으로 답변 생성 (시스템 프롬프트 + 대화 기록 + 멀티모달 지원)"""
        history_text = self._build_history_text(history)

        # 시스템 프롬프트 기본값 (한국어 모델이면 한국어 최적화 프롬프트)
        if system_prompt:
            sys_prompt = system_prompt
        elif self._is_korean_model(model or self.default_model):
            sys_prompt = (
                "당신은 한국어에 능숙한 AI 어시스턴트입니다. "
                "주어진 문맥을 바탕으로 정확하고 자연스러운 한국어로 답변하세요. "
                "문맥에 없는 내용은 추측하지 말고 모른다고 답하세요."
            )
        else:
            sys_prompt = (
                "당신은 도움이 되는 AI 어시스턴트입니다. "
                "참고 문맥이 제공되면 해당 내용을 바탕으로 정확하게 답변하세요. "
                "참고 문맥이 없거나 관련 문서를 찾지 못한 경우에도 가능한 범위 내에서 답변하세요. "
                "절대로 '권한이 없다', '접근할 수 없다'와 같은 표현을 사용하지 마세요."
            )

        # 동적으로 프롬프트 구성
        template_parts = [sys_prompt, ""]

        if history_text:
            template_parts.append("[이전 대화]\n{history}\n")

        if context:
            template_parts.append("[참고 문맥]\n{context}\n")
        else:
            template_parts.append(
                "[참고 문맥]\n"
                "검색된 관련 문서가 없습니다. "
                "지식베이스에 관련 문서가 아직 업로드되지 않았거나, 질문과 관련된 내용이 없을 수 있습니다. "
                "가지고 있는 일반 지식을 바탕으로 최선의 답변을 제공하세요. "
                "단, 지식베이스에서 관련 문서를 찾지 못했다는 점을 답변 시작 부분에 간략히 언급해주세요.\n"
            )

        template_parts.append("[질문]\n{question}\n\n답변:")

        full_prompt = "\n".join(template_parts).format(
            history=history_text,
            context=context,
            question=question
        )

        # 이미지가 있으면 Ollama Vision API 직접 호출 (자동으로 Vision 모델로 전환)
        if images:
            import httpx

            # Vision 모델로 자동 전환
            vision_model = settings.VISION_MODEL
            current_model = model or self.default_model

            # 현재 모델이 Vision 모델이 아니면 전환
            if current_model != vision_model:
                logger.info(f"[Vision] 이미지 감지: {current_model} → {vision_model} 자동 전환")

            async with httpx.AsyncClient(timeout=120.0) as client:
                try:
                    response = await client.post(
                        f"{settings.OLLAMA_BASE_URL}/api/generate",
                        json={
                            "model": vision_model,  # Vision 모델 사용
                            "prompt": full_prompt,
                            "images": images,
                            "stream": True
                        },
                        timeout=120.0
                    )
                    response.raise_for_status()

                    async for line in response.aiter_lines():
                        if line.strip():
                            try:
                                data = json.loads(line)
                                if "response" in data:
                                    yield data["response"]
                            except json.JSONDecodeError:
                                continue
                except Exception as e:
                    logger.error(f"Ollama vision API error: {e}")
                    yield f"[이미지 분석 오류: {str(e)}] Vision 모델({vision_model})이 설치되어 있는지 확인해주세요."
        else:
            # 기존 LangChain 방식 (텍스트 전용)
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
