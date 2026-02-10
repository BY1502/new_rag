"""
rag_service.py 단위 테스트
- 의도 분석 (Router)
- 캐시 키 생성
- 웹 검색
- 응답 생성 파이프라인
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.rag_service import RAGService


@pytest.fixture
def rag_service():
    """테스트용 RAGService (싱글톤 우회)"""
    RAGService._instance = None
    RAGService._initialized = False

    with patch("app.services.rag_service.get_vector_store_service") as mock_vs:
        with patch("app.services.rag_service.get_cache_service") as mock_cs:
            with patch("app.services.rag_service.DuckDuckGoSearchRun"):
                mock_cache = AsyncMock()
                mock_cache.get = AsyncMock(return_value=None)
                mock_cache.set = AsyncMock(return_value=True)
                mock_cs.return_value = mock_cache

                service = RAGService()
                service.cache_service = mock_cache
                service.vector_service = mock_vs.return_value

    yield service

    RAGService._instance = None
    RAGService._initialized = False


class TestCacheKey:
    """캐시 키 생성 테스트"""

    def test_cache_key_deterministic(self, rag_service):
        """같은 입력이면 같은 키"""
        k1 = rag_service._get_cache_key("query", "kb1", 1)
        k2 = rag_service._get_cache_key("query", "kb1", 1)
        assert k1 == k2

    def test_cache_key_different_query(self, rag_service):
        """다른 쿼리면 다른 키"""
        k1 = rag_service._get_cache_key("query1", "kb1", 1)
        k2 = rag_service._get_cache_key("query2", "kb1", 1)
        assert k1 != k2

    def test_cache_key_prefix(self, rag_service):
        """키가 'rag:' 접두사 포함"""
        key = rag_service._get_cache_key("q", "kb", 1)
        assert key.startswith("rag:")


class TestIntentAnalysis:
    """의도 분석 (Router) 테스트"""

    @pytest.mark.asyncio
    async def test_web_search_mode(self, rag_service):
        """웹 검색 사용 시 'search' 반환"""
        llm = MagicMock()
        result = await rag_service._analyze_intent(
            "최신 뉴스", llm, use_web_search=True, use_deep_think=False
        )
        assert result == "search"

    @pytest.mark.asyncio
    async def test_process_mode_keywords(self, rag_service):
        """물류 키워드 포함 시 'process' 반환"""
        llm = MagicMock()
        result = await rag_service._analyze_intent(
            "배차 일정을 확인해주세요", llm, use_web_search=False, use_deep_think=False
        )
        assert result == "process"

    @pytest.mark.asyncio
    async def test_rag_mode_default(self, rag_service):
        """기본 모드는 'rag'"""
        llm = MagicMock()
        result = await rag_service._analyze_intent(
            "매뉴얼에서 설치 방법을 알려줘", llm, use_web_search=False, use_deep_think=False
        )
        assert result == "rag"

    @pytest.mark.asyncio
    async def test_process_keywords_list(self, rag_service):
        """다양한 물류 키워드 테스트"""
        llm = MagicMock()
        keywords = ["배차", "주문", "루트", "지시", "배송", "물류"]
        for keyword in keywords:
            result = await rag_service._analyze_intent(
                f"{keyword} 처리", llm, use_web_search=False, use_deep_think=False
            )
            assert result == "process", f"키워드 '{keyword}'가 process로 인식되지 않음"


class TestWebSearch:
    """웹 검색 테스트"""

    @pytest.mark.asyncio
    async def test_web_search_success(self, rag_service):
        """웹 검색 성공"""
        rag_service.web_search_tool = MagicMock()
        rag_service.web_search_tool.invoke = MagicMock(return_value="search results here")

        result = await rag_service._web_search("test query", use_deep_think=False)
        assert "[Web Search Result]" in result
        assert "search results here" in result

    @pytest.mark.asyncio
    async def test_web_search_failure(self, rag_service):
        """웹 검색 실패 시 빈 문자열"""
        rag_service.web_search_tool = MagicMock()
        rag_service.web_search_tool.invoke = MagicMock(side_effect=Exception("API error"))

        result = await rag_service._web_search("test", use_deep_think=False)
        assert result == ""


class TestRetrieveContext:
    """컨텍스트 검색 테스트"""

    @pytest.mark.asyncio
    async def test_returns_cached_context(self, rag_service):
        """캐시된 컨텍스트 반환"""
        with patch.object(rag_service, '_get_cached_context', new_callable=AsyncMock) as mock_cache:
            mock_cache.return_value = "cached context"
            result = await rag_service._retrieve_context("query", "kb1", 1)
            assert result == "cached context"

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_docs(self, rag_service):
        """문서 없으면 빈 문자열"""
        with patch.object(rag_service, '_get_cached_context', new_callable=AsyncMock) as mock_cache:
            mock_cache.return_value = None

            mock_retriever = AsyncMock()
            mock_retriever.ainvoke = AsyncMock(return_value=[])
            rag_service.vector_service.get_retriever = MagicMock(return_value=mock_retriever)

            result = await rag_service._retrieve_context("query", "kb1", 1)
            assert result == ""


class TestGenerateResponse:
    """응답 생성 파이프라인 테스트"""

    @pytest.mark.asyncio
    async def test_error_handling(self, rag_service):
        """에러 발생 시 에러 메시지 반환"""
        with patch.object(rag_service, '_analyze_intent', side_effect=Exception("Test error")):
            chunks = []
            async for chunk in rag_service.generate_response(
                message="test",
                kb_id="kb1",
                user_id=1,
            ):
                chunks.append(chunk)

            assert len(chunks) > 0
            last_chunk = json.loads(chunks[-1])
            assert last_chunk["type"] == "content"
            assert "오류" in last_chunk["content"]
