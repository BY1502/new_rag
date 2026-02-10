from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_settings import UserSettings


async def get_user_settings(db: AsyncSession, user_id: int) -> Optional[UserSettings]:
    """사용자 설정을 조회합니다."""
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    return result.scalars().first()


async def create_default_settings(db: AsyncSession, user_id: int) -> UserSettings:
    """기본 사용자 설정을 생성합니다."""
    settings = UserSettings(user_id=user_id)
    db.add(settings)
    await db.commit()
    await db.refresh(settings)
    return settings


async def get_or_create_settings(db: AsyncSession, user_id: int) -> UserSettings:
    """사용자 설정을 조회하거나 없으면 기본값을 생성합니다."""
    existing = await get_user_settings(db, user_id)
    if existing:
        return existing
    return await create_default_settings(db, user_id)


async def update_user_settings(db: AsyncSession, user_id: int, updates: dict) -> UserSettings:
    """사용자 설정을 부분 업데이트합니다."""
    settings = await get_or_create_settings(db, user_id)
    for key, value in updates.items():
        if value is not None and hasattr(settings, key):
            setattr(settings, key, value)
    await db.commit()
    await db.refresh(settings)
    return settings
