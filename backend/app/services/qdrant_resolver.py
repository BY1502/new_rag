"""
Qdrant Client Resolver
- KB의 external_service_id를 기반으로 적절한 QdrantClient를 반환
- TTL 캐시로 외부 QdrantClient 인스턴스 관리
- 연결 실패 시 None 반환 (로컬 Qdrant fallback)
"""
import time
import logging
from typing import Optional, Tuple

from qdrant_client import QdrantClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.knowledge_base import get_knowledge_base
from app.crud.external_service import get_decrypted_service

logger = logging.getLogger(__name__)

# Cache: (user_id, service_id) -> (QdrantClient, created_timestamp)
_client_cache: dict[Tuple[int, str], Tuple[QdrantClient, float]] = {}
_CACHE_TTL_SECONDS = 300  # 5분


def _get_cached_client(user_id: int, service_id: str) -> Optional[QdrantClient]:
    key = (user_id, service_id)
    if key in _client_cache:
        client, created_at = _client_cache[key]
        if time.time() - created_at < _CACHE_TTL_SECONDS:
            return client
        del _client_cache[key]
    return None


def _set_cached_client(user_id: int, service_id: str, client: QdrantClient):
    _client_cache[(user_id, service_id)] = (client, time.time())


async def resolve_qdrant_client(
    db: AsyncSession,
    user_id: int,
    kb_id: str
) -> Optional[QdrantClient]:
    """
    KB에 연결된 외부 Qdrant 서비스가 있으면 해당 QdrantClient를 반환합니다.
    없거나 연결 실패 시 None을 반환합니다 (로컬 Qdrant 사용).
    """
    kb = await get_knowledge_base(db, user_id, kb_id)
    if not kb or not kb.external_service_id:
        return None

    service_id = kb.external_service_id

    # 캐시 확인
    cached = _get_cached_client(user_id, service_id)
    if cached is not None:
        return cached

    # DB에서 서비스 정보 복호화
    svc_data = await get_decrypted_service(db, user_id, service_id)
    if not svc_data:
        logger.warning(
            f"External service '{service_id}' not found for user {user_id}, "
            f"falling back to local Qdrant for KB '{kb_id}'"
        )
        return None

    if svc_data.get("service_type") != "qdrant":
        logger.warning(
            f"External service '{service_id}' is type '{svc_data.get('service_type')}', "
            f"not qdrant. Falling back to local for KB '{kb_id}'"
        )
        return None

    # QdrantClient 생성 + 연결 테스트
    try:
        url = svc_data.get("url", "")
        api_key = svc_data.get("api_key")
        client = QdrantClient(url=url, api_key=api_key, timeout=10)
        client.get_collections()  # 연결 테스트
        _set_cached_client(user_id, service_id, client)
        logger.info(f"Connected to external Qdrant '{service_id}' at {url}")
        return client
    except Exception as e:
        logger.warning(
            f"Failed to connect to external Qdrant '{service_id}' at "
            f"{svc_data.get('url')}: {e}. Falling back to local for KB '{kb_id}'"
        )
        return None


def invalidate_cache(user_id: int, service_id: str):
    """외부 서비스 수정/삭제 시 캐시를 무효화합니다."""
    key = (user_id, service_id)
    if key in _client_cache:
        del _client_cache[key]
