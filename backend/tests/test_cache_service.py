"""
cache_service.py 단위 테스트
- CacheService 기본 연산 (Redis 모킹)
- Rate Limiting (인메모리 폴백)
- 캐시 키 생성
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.services.cache_service import CacheService


@pytest.fixture
def cache_service():
    """테스트용 CacheService 인스턴스 (싱글톤 우회)"""
    # 싱글톤 상태 초기화
    CacheService._instance = None
    CacheService._initialized = False

    service = CacheService()
    # Redis 미연결 상태로 시작
    service._connected = False
    service._client = None
    service._fallback_store = {}
    return service


class TestCacheServiceBasic:
    """기본 캐시 연산 테스트"""

    @pytest.mark.asyncio
    async def test_get_returns_none_when_disconnected(self, cache_service):
        """Redis 미연결 시 None 반환"""
        result = await cache_service.get("test_key")
        assert result is None

    @pytest.mark.asyncio
    async def test_set_returns_false_when_disconnected(self, cache_service):
        """Redis 미연결 시 False 반환"""
        result = await cache_service.set("key", "value")
        assert result is False

    @pytest.mark.asyncio
    async def test_delete_returns_false_when_disconnected(self, cache_service):
        """Redis 미연결 시 삭제 False"""
        result = await cache_service.delete("key")
        assert result is False

    @pytest.mark.asyncio
    async def test_get_with_mock_redis(self, cache_service):
        """Mock Redis로 get 테스트"""
        cache_service._connected = True
        cache_service._client = AsyncMock()
        cache_service._client.get = AsyncMock(return_value="cached_value")

        result = await cache_service.get("test_key")
        assert result == "cached_value"
        cache_service._client.get.assert_called_once_with("test_key")

    @pytest.mark.asyncio
    async def test_set_with_mock_redis(self, cache_service):
        """Mock Redis로 set 테스트"""
        cache_service._connected = True
        cache_service._client = AsyncMock()
        cache_service._client.setex = AsyncMock()

        result = await cache_service.set("key", "value", ttl=300)
        assert result is True
        cache_service._client.setex.assert_called_once_with("key", 300, "value")

    @pytest.mark.asyncio
    async def test_delete_with_mock_redis(self, cache_service):
        """Mock Redis로 delete 테스트"""
        cache_service._connected = True
        cache_service._client = AsyncMock()
        cache_service._client.delete = AsyncMock()

        result = await cache_service.delete("key")
        assert result is True

    @pytest.mark.asyncio
    async def test_get_json(self, cache_service):
        """JSON 캐시 조회"""
        cache_service._connected = True
        cache_service._client = AsyncMock()
        cache_service._client.get = AsyncMock(return_value='{"name": "test"}')

        result = await cache_service.get_json("key")
        assert result == {"name": "test"}

    @pytest.mark.asyncio
    async def test_get_json_invalid(self, cache_service):
        """잘못된 JSON 캐시"""
        cache_service._connected = True
        cache_service._client = AsyncMock()
        cache_service._client.get = AsyncMock(return_value="not-json")

        result = await cache_service.get_json("key")
        assert result is None

    @pytest.mark.asyncio
    async def test_set_json(self, cache_service):
        """JSON 캐시 저장"""
        cache_service._connected = True
        cache_service._client = AsyncMock()
        cache_service._client.setex = AsyncMock()

        result = await cache_service.set_json("key", {"a": 1}, ttl=60)
        assert result is True


class TestCacheKeyGeneration:
    """캐시 키 생성 테스트"""

    def test_generate_cache_key_deterministic(self, cache_service):
        """같은 입력이면 같은 키"""
        k1 = cache_service._generate_cache_key("rag", "query", "kb1", 1)
        k2 = cache_service._generate_cache_key("rag", "query", "kb1", 1)
        assert k1 == k2

    def test_generate_cache_key_different_inputs(self, cache_service):
        """다른 입력이면 다른 키"""
        k1 = cache_service._generate_cache_key("rag", "query1", "kb1", 1)
        k2 = cache_service._generate_cache_key("rag", "query2", "kb1", 1)
        assert k1 != k2

    def test_generate_cache_key_prefix(self, cache_service):
        """키에 prefix 포함"""
        key = cache_service._generate_cache_key("rag", "query", "kb", 1)
        assert key.startswith("rag:")

    def test_generate_cache_key_length(self, cache_service):
        """키 길이 확인 (prefix:16자 해시)"""
        key = cache_service._generate_cache_key("emb", "text")
        prefix, hash_part = key.split(":")
        assert prefix == "emb"
        assert len(hash_part) == 16


class TestFallbackRateLimit:
    """인메모리 Rate Limiting 테스트"""

    @pytest.mark.asyncio
    async def test_allows_within_limit(self, cache_service):
        """제한 이내 허용"""
        allowed, count, remaining = await cache_service._fallback_rate_limit(
            "test_ip", max_requests=5, window_seconds=60
        )
        assert allowed is True
        assert count == 1
        assert remaining == 0

    @pytest.mark.asyncio
    async def test_blocks_over_limit(self, cache_service):
        """제한 초과 차단"""
        for _ in range(5):
            await cache_service._fallback_rate_limit("ip1", 5, 60)

        allowed, count, remaining = await cache_service._fallback_rate_limit(
            "ip1", 5, 60
        )
        assert allowed is False
        assert count == 5

    @pytest.mark.asyncio
    async def test_separate_identifiers(self, cache_service):
        """다른 식별자는 독립적"""
        for _ in range(5):
            await cache_service._fallback_rate_limit("ip_a", 5, 60)

        allowed, _, _ = await cache_service._fallback_rate_limit("ip_b", 5, 60)
        assert allowed is True

    @pytest.mark.asyncio
    async def test_check_rate_limit_uses_fallback_when_disconnected(self, cache_service):
        """Redis 미연결 시 폴백 사용"""
        allowed, count, remaining = await cache_service.check_rate_limit(
            "test", max_requests=10, window_seconds=60
        )
        assert allowed is True


class TestConversationHistory:
    """대화 히스토리 테스트"""

    @pytest.mark.asyncio
    async def test_get_conversation_disconnected(self, cache_service):
        """미연결 시 None"""
        result = await cache_service.get_conversation("session1")
        assert result is None

    @pytest.mark.asyncio
    async def test_add_to_conversation_disconnected(self, cache_service):
        """미연결 시 False"""
        result = await cache_service.add_to_conversation(
            "session1", {"role": "user", "content": "hello"}
        )
        assert result is False

    @pytest.mark.asyncio
    async def test_clear_conversation_disconnected(self, cache_service):
        """미연결 시 False"""
        result = await cache_service.clear_conversation("session1")
        assert result is False

    @pytest.fixture(autouse=True)
    def cleanup(self):
        """테스트 후 싱글톤 정리"""
        yield
        CacheService._instance = None
        CacheService._initialized = False
