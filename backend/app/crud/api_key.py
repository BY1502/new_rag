from typing import Optional, List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey
from app.core.encryption import encrypt_value, decrypt_value


async def get_api_keys_for_user(db: AsyncSession, user_id: int) -> List[ApiKey]:
    """사용자의 모든 API 키를 조회합니다."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user_id)
    )
    return list(result.scalars().all())


async def get_api_key_for_user(db: AsyncSession, user_id: int, provider: str) -> Optional[ApiKey]:
    """사용자의 특정 프로바이더 API 키 객체를 반환합니다."""
    result = await db.execute(
        select(ApiKey).where(
            and_(ApiKey.user_id == user_id, ApiKey.provider == provider.lower())
        )
    )
    return result.scalars().first()


async def get_api_key_value(db: AsyncSession, user_id: int, provider: str) -> Optional[str]:
    """사용자의 특정 프로바이더 API 키를 복호화하여 반환합니다."""
    key_row = await get_api_key_for_user(db, user_id, provider)
    if key_row:
        return decrypt_value(key_row.encrypted_key)
    return None


async def save_api_key(db: AsyncSession, user_id: int, provider: str, key: str) -> ApiKey:
    """API 키를 암호화하여 저장합니다 (upsert)."""
    provider_lower = provider.lower()
    result = await db.execute(
        select(ApiKey).where(
            and_(ApiKey.user_id == user_id, ApiKey.provider == provider_lower)
        )
    )
    existing = result.scalars().first()

    encrypted = encrypt_value(key)

    if existing:
        existing.encrypted_key = encrypted
        await db.commit()
        await db.refresh(existing)
        return existing

    new_key = ApiKey(user_id=user_id, provider=provider_lower, encrypted_key=encrypted)
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)
    return new_key


async def delete_api_key(db: AsyncSession, user_id: int, provider: str) -> bool:
    """API 키를 삭제합니다."""
    result = await db.execute(
        select(ApiKey).where(
            and_(ApiKey.user_id == user_id, ApiKey.provider == provider.lower())
        )
    )
    key_row = result.scalars().first()
    if key_row:
        await db.delete(key_row)
        await db.commit()
        return True
    return False
