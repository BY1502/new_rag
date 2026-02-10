"""
외부 서비스 CRUD
"""
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.external_service import ExternalService
from app.core.encryption import encrypt_value, decrypt_value


async def list_external_services(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(ExternalService)
        .where(ExternalService.user_id == user_id)
        .order_by(ExternalService.created_at.desc())
    )
    return result.scalars().all()


async def get_external_service(db: AsyncSession, user_id: int, service_id: str):
    result = await db.execute(
        select(ExternalService)
        .where(ExternalService.user_id == user_id, ExternalService.service_id == service_id)
    )
    return result.scalar_one_or_none()


async def create_external_service(db: AsyncSession, user_id: int, data: dict) -> ExternalService:
    svc = ExternalService(
        user_id=user_id,
        service_id=data["service_id"],
        name=data["name"],
        service_type=data["service_type"],
        url=data.get("url", ""),
        username=data.get("username", ""),
        database=data.get("database", ""),
        port=data.get("port"),
        is_default=data.get("is_default", False),
    )
    if data.get("api_key"):
        svc.api_key_encrypted = encrypt_value(data["api_key"])
    if data.get("password"):
        svc.encrypted_password = encrypt_value(data["password"])

    db.add(svc)
    await db.commit()
    await db.refresh(svc)
    return svc


async def update_external_service(db: AsyncSession, svc: ExternalService, updates: dict) -> ExternalService:
    for key in ("name", "url", "username", "database", "port", "is_default"):
        if key in updates and updates[key] is not None:
            setattr(svc, key, updates[key])
    if "api_key" in updates and updates["api_key"] is not None:
        svc.api_key_encrypted = encrypt_value(updates["api_key"])
    if "password" in updates and updates["password"] is not None:
        svc.encrypted_password = encrypt_value(updates["password"])

    await db.commit()
    await db.refresh(svc)
    return svc


async def delete_external_service(db: AsyncSession, user_id: int, service_id: str) -> bool:
    result = await db.execute(
        delete(ExternalService)
        .where(ExternalService.user_id == user_id, ExternalService.service_id == service_id)
    )
    await db.commit()
    return result.rowcount > 0


async def get_decrypted_service(db: AsyncSession, user_id: int, service_id: str) -> dict | None:
    """서비스 정보를 복호화하여 반환합니다."""
    svc = await get_external_service(db, user_id, service_id)
    if not svc:
        return None

    result = {
        "service_id": svc.service_id,
        "name": svc.name,
        "service_type": svc.service_type,
        "url": svc.url,
        "username": svc.username,
        "database": svc.database,
        "port": svc.port,
    }
    if svc.api_key_encrypted:
        try:
            result["api_key"] = decrypt_value(svc.api_key_encrypted)
        except Exception:
            result["api_key"] = None
    if svc.encrypted_password:
        try:
            result["password"] = decrypt_value(svc.encrypted_password)
        except Exception:
            result["password"] = None
    return result
