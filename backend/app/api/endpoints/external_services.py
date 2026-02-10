"""
외부 서비스 관리 엔드포인트 (Qdrant / PostgreSQL 등)
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.deps import get_current_user
from app.schemas.external_service import (
    ExternalServiceCreate,
    ExternalServiceUpdate,
    ExternalServiceResponse,
    ExternalServiceListResponse,
)
from app.crud.external_service import (
    list_external_services,
    get_external_service,
    create_external_service,
    update_external_service,
    delete_external_service,
    get_decrypted_service,
)
from app.services.qdrant_resolver import invalidate_cache

logger = logging.getLogger(__name__)
router = APIRouter()


def _to_response(svc) -> ExternalServiceResponse:
    return ExternalServiceResponse(
        service_id=svc.service_id,
        name=svc.name,
        service_type=svc.service_type,
        url=svc.url or "",
        username=svc.username or "",
        database=svc.database or "",
        port=svc.port,
        is_default=svc.is_default,
        has_api_key=bool(svc.api_key_encrypted),
        has_password=bool(svc.encrypted_password),
        created_at=svc.created_at,
    )


@router.get("", response_model=ExternalServiceListResponse)
async def list_services(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    services = await list_external_services(db, current_user.id)
    return {"services": [_to_response(s) for s in services]}


@router.post("", response_model=ExternalServiceResponse)
async def create_service(
    data: ExternalServiceCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await get_external_service(db, current_user.id, data.service_id)
    if existing:
        raise HTTPException(status_code=400, detail="이미 같은 service_id가 존재합니다.")

    svc = await create_external_service(db, current_user.id, data.model_dump())
    return _to_response(svc)


@router.put("/{service_id}", response_model=ExternalServiceResponse)
async def update_service(
    service_id: str,
    data: ExternalServiceUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = await get_external_service(db, current_user.id, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

    updated = await update_external_service(db, svc, data.model_dump(exclude_unset=True))
    invalidate_cache(current_user.id, service_id)
    return _to_response(updated)


@router.delete("/{service_id}")
async def delete_service(
    service_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_external_service(db, current_user.id, service_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")
    invalidate_cache(current_user.id, service_id)
    return {"detail": "삭제되었습니다."}


@router.post("/{service_id}/test")
async def test_service_connection(
    service_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """외부 서비스 연결 테스트"""
    svc_data = await get_decrypted_service(db, current_user.id, service_id)
    if not svc_data:
        raise HTTPException(status_code=404, detail="서비스를 찾을 수 없습니다.")

    svc_type = svc_data["service_type"]

    if svc_type == "qdrant":
        return await _test_qdrant(svc_data)
    elif svc_type == "postgresql":
        return await _test_postgresql(svc_data)
    elif svc_type == "pinecone":
        return await _test_pinecone(svc_data)
    else:
        return {"status": "error", "detail": f"지원하지 않는 서비스 타입: {svc_type}"}


async def _test_qdrant(svc: dict) -> dict:
    try:
        from qdrant_client import QdrantClient

        url = svc.get("url", "")
        api_key = svc.get("api_key")
        client = QdrantClient(url=url, api_key=api_key, timeout=5)
        collections = client.get_collections()
        count = len(collections.collections)
        return {"status": "connected", "detail": f"Qdrant 연결 성공 (컬렉션 {count}개)"}
    except Exception as e:
        return {"status": "disconnected", "detail": f"Qdrant 연결 실패: {e}"}


async def _test_postgresql(svc: dict) -> dict:
    try:
        import asyncpg

        conn = await asyncpg.connect(
            host=svc.get("url", "localhost"),
            port=svc.get("port") or 5432,
            user=svc.get("username", ""),
            password=svc.get("password", ""),
            database=svc.get("database", "postgres"),
            timeout=5,
        )
        version = await conn.fetchval("SELECT version()")
        await conn.close()
        return {"status": "connected", "detail": f"PostgreSQL 연결 성공: {version[:60]}"}
    except Exception as e:
        return {"status": "disconnected", "detail": f"PostgreSQL 연결 실패: {e}"}


async def _test_pinecone(svc: dict) -> dict:
    try:
        from pinecone import Pinecone

        api_key = svc.get("api_key", "")
        index_name = svc.get("database", "")  # index_name을 database 필드에 저장
        if not api_key:
            return {"status": "error", "detail": "Pinecone API 키가 필요합니다."}

        pc = Pinecone(api_key=api_key)
        indexes = pc.list_indexes()
        names = [idx.name for idx in indexes]
        if index_name and index_name in names:
            return {"status": "connected", "detail": f"Pinecone 연결 성공 (인덱스 '{index_name}' 확인)"}
        return {"status": "connected", "detail": f"Pinecone 연결 성공 (인덱스 {len(names)}개)"}
    except ImportError:
        return {"status": "error", "detail": "Pinecone 패키지가 설치되지 않았습니다. pip install pinecone"}
    except Exception as e:
        return {"status": "disconnected", "detail": f"Pinecone 연결 실패: {e}"}
