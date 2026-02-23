"""
Redis 캐시 서비스
- 캐싱
- Rate Limiting
- 세션 관리
"""
import json
import hashlib
import logging
from typing import Optional, Any, List
from functools import lru_cache
from datetime import datetime, timedelta

import redis.asyncio as redis
from redis.asyncio import ConnectionPool

from app.core.config import settings

logger = logging.getLogger(__name__)


class CacheService:
    """Redis 기반 캐시 서비스"""

    _instance: Optional["CacheService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if CacheService._initialized:
            return
        CacheService._initialized = True

        self._pool: Optional[ConnectionPool] = None
        self._client: Optional[redis.Redis] = None
        self._connected: bool = False

    async def connect(self) -> bool:
        """Redis 연결"""
        if self._connected:
            return True

        try:
            self._pool = ConnectionPool.from_url(
                settings.REDIS_URL,
                password=settings.REDIS_PASSWORD,
                decode_responses=True,
                max_connections=20,
            )
            self._client = redis.Redis(connection_pool=self._pool)
            await self._client.ping()
            self._connected = True
            logger.info("Redis 연결 성공")
            return True
        except Exception as e:
            logger.warning(f"Redis 연결 실패: {e}")
            self._connected = False
            return False

    async def disconnect(self):
        """Redis 연결 해제"""
        if self._client:
            await self._client.close()
        if self._pool:
            await self._pool.disconnect()
        self._connected = False
        logger.info("Redis 연결 해제")

    @property
    def is_connected(self) -> bool:
        return self._connected

    # ============================================================
    # 기본 캐시 연산
    # ============================================================

    async def get(self, key: str) -> Optional[str]:
        """캐시 값 조회"""
        if not self._connected or not settings.CACHE_ENABLED:
            return None
        try:
            return await self._client.get(key)
        except Exception as e:
            logger.error(f"캐시 조회 실패: {e}")
            return None

    async def set(
        self,
        key: str,
        value: str,
        ttl: Optional[int] = None
    ) -> bool:
        """캐시 값 저장"""
        if not self._connected or not settings.CACHE_ENABLED:
            return False
        try:
            if ttl is None:
                ttl = settings.CACHE_TTL_SECONDS
            if ttl == 0:
                # ttl=0 → 영구 저장 (만료 없음)
                await self._client.set(key, value)
            else:
                await self._client.setex(key, ttl, value)
            return True
        except Exception as e:
            logger.error(f"캐시 저장 실패: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """캐시 삭제"""
        if not self._connected:
            return False
        try:
            await self._client.delete(key)
            return True
        except Exception as e:
            logger.error(f"캐시 삭제 실패: {e}")
            return False

    async def get_json(self, key: str) -> Optional[Any]:
        """JSON 캐시 조회"""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None

    async def set_json(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """JSON 캐시 저장"""
        try:
            json_str = json.dumps(value, ensure_ascii=False)
            return await self.set(key, json_str, ttl)
        except (TypeError, ValueError) as e:
            logger.error(f"JSON 직렬화 실패: {e}")
            return False

    # ============================================================
    # Rate Limiting
    # ============================================================

    async def check_rate_limit(
        self,
        identifier: str,
        max_requests: int,
        window_seconds: Optional[int] = None
    ) -> tuple[bool, int, int]:
        """
        Rate Limit 체크 (Sliding Window 알고리즘)

        Args:
            identifier: 식별자 (예: IP, user_id)
            max_requests: 윈도우 내 최대 요청 수
            window_seconds: 윈도우 크기 (초)

        Returns:
            (허용 여부, 현재 요청 수, 남은 시간)
        """
        window_seconds = window_seconds or settings.RATE_LIMIT_WINDOW_SECONDS
        key = f"rate_limit:{identifier}"
        now = datetime.now().timestamp()

        # Redis가 연결되지 않은 경우 인메모리 폴백
        if not self._connected:
            return await self._fallback_rate_limit(identifier, max_requests, window_seconds)

        try:
            pipe = self._client.pipeline()

            # 오래된 요청 제거
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            # 현재 요청 추가
            pipe.zadd(key, {str(now): now})
            # 현재 요청 수 확인
            pipe.zcard(key)
            # TTL 설정
            pipe.expire(key, window_seconds)

            results = await pipe.execute()
            current_count = results[2]

            if current_count > max_requests:
                # 가장 오래된 요청의 만료 시간 계산
                oldest = await self._client.zrange(key, 0, 0, withscores=True)
                if oldest:
                    remaining = int(window_seconds - (now - oldest[0][1]))
                else:
                    remaining = window_seconds
                return (False, current_count, max(0, remaining))

            return (True, current_count, 0)

        except Exception as e:
            logger.error(f"Rate limit 체크 실패: {e}")
            # Redis 오류 시 허용 (fail-open)
            return (True, 0, 0)

    # 인메모리 폴백 Rate Limiter
    _fallback_store: dict = {}

    async def _fallback_rate_limit(
        self,
        identifier: str,
        max_requests: int,
        window_seconds: int
    ) -> tuple[bool, int, int]:
        """Redis 연결 실패 시 인메모리 Rate Limit"""
        now = datetime.now().timestamp()

        # 오래된 요청 제거
        if identifier in self._fallback_store:
            self._fallback_store[identifier] = [
                t for t in self._fallback_store[identifier]
                if now - t < window_seconds
            ]
        else:
            self._fallback_store[identifier] = []

        current_count = len(self._fallback_store[identifier])

        if current_count >= max_requests:
            oldest = min(self._fallback_store[identifier]) if self._fallback_store[identifier] else now
            remaining = int(window_seconds - (now - oldest))
            return (False, current_count, max(0, remaining))

        self._fallback_store[identifier].append(now)
        return (True, current_count + 1, 0)

    # ============================================================
    # RAG 캐시
    # ============================================================

    def _generate_cache_key(self, prefix: str, *args) -> str:
        """캐시 키 생성"""
        combined = ":".join(str(arg) for arg in args)
        hash_val = hashlib.md5(combined.encode()).hexdigest()[:16]
        return f"{prefix}:{hash_val}"

    async def get_rag_cache(
        self,
        query: str,
        kb_id: str,
        user_id: int
    ) -> Optional[dict]:
        """RAG 응답 캐시 조회"""
        key = self._generate_cache_key("rag", query, kb_id, user_id)
        return await self.get_json(key)

    async def set_rag_cache(
        self,
        query: str,
        kb_id: str,
        user_id: int,
        response: dict,
        ttl: Optional[int] = None
    ) -> bool:
        """RAG 응답 캐시 저장"""
        key = self._generate_cache_key("rag", query, kb_id, user_id)
        return await self.set_json(key, response, ttl)

    async def get_embedding_cache(self, text: str) -> Optional[List[float]]:
        """임베딩 캐시 조회"""
        key = self._generate_cache_key("emb", text)
        return await self.get_json(key)

    async def set_embedding_cache(
        self,
        text: str,
        embedding: List[float],
        ttl: int = 86400  # 24시간
    ) -> bool:
        """임베딩 캐시 저장"""
        key = self._generate_cache_key("emb", text)
        return await self.set_json(key, embedding, ttl)

    # ============================================================
    # 세션/대화 히스토리
    # ============================================================

    async def get_conversation(
        self,
        session_id: str
    ) -> Optional[List[dict]]:
        """대화 히스토리 조회"""
        key = f"conv:{session_id}"
        return await self.get_json(key)

    async def add_to_conversation(
        self,
        session_id: str,
        message: dict,
        max_messages: int = 50,
        ttl: int = 86400
    ) -> bool:
        """대화에 메시지 추가"""
        if not self._connected:
            return False

        key = f"conv:{session_id}"
        try:
            # 기존 대화 조회
            history = await self.get_json(key) or []
            history.append(message)

            # 최대 메시지 수 제한
            if len(history) > max_messages:
                history = history[-max_messages:]

            return await self.set_json(key, history, ttl)
        except Exception as e:
            logger.error(f"대화 저장 실패: {e}")
            return False

    async def clear_conversation(self, session_id: str) -> bool:
        """대화 히스토리 삭제"""
        return await self.delete(f"conv:{session_id}")


@lru_cache()
def get_cache_service() -> CacheService:
    """싱글톤 CacheService 인스턴스 반환"""
    return CacheService()
