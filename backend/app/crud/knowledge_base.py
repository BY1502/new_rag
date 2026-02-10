"""
지식 베이스 CRUD
"""
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBase, KnowledgeFile


async def list_knowledge_bases(db: AsyncSession, user_id: int) -> List[dict]:
    """사용자의 KB 목록을 파일 수 포함하여 반환합니다."""
    stmt = (
        select(
            KnowledgeBase,
            func.count(KnowledgeFile.id).label("file_count")
        )
        .outerjoin(KnowledgeFile, KnowledgeFile.kb_pk == KnowledgeBase.id)
        .where(KnowledgeBase.user_id == user_id)
        .group_by(KnowledgeBase.id)
        .order_by(KnowledgeBase.created_at)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id": kb.id,
            "kb_id": kb.kb_id,
            "name": kb.name,
            "description": kb.description or "",
            "chunk_size": kb.chunk_size,
            "chunk_overlap": kb.chunk_overlap,
            "external_service_id": kb.external_service_id,
            "file_count": file_count,
            "created_at": kb.created_at,
            "updated_at": kb.updated_at,
        }
        for kb, file_count in rows
    ]


async def get_knowledge_base(db: AsyncSession, user_id: int, kb_id: str) -> Optional[KnowledgeBase]:
    """KB를 kb_id + user_id로 조회합니다."""
    stmt = select(KnowledgeBase).where(
        KnowledgeBase.user_id == user_id,
        KnowledgeBase.kb_id == kb_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_knowledge_base(db: AsyncSession, user_id: int, kb_id: str, name: str,
                                 description: str = "", chunk_size: int = 512,
                                 chunk_overlap: int = 50,
                                 external_service_id: str = None) -> KnowledgeBase:
    """KB를 생성합니다."""
    kb = KnowledgeBase(
        kb_id=kb_id,
        user_id=user_id,
        name=name,
        description=description,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        external_service_id=external_service_id,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return kb


async def update_knowledge_base(db: AsyncSession, user_id: int, kb_id: str,
                                 updates: dict) -> Optional[KnowledgeBase]:
    """KB를 부분 업데이트합니다."""
    kb = await get_knowledge_base(db, user_id, kb_id)
    if not kb:
        return None
    for k, v in updates.items():
        if hasattr(kb, k):
            setattr(kb, k, v)
    await db.commit()
    await db.refresh(kb)
    return kb


async def delete_knowledge_base(db: AsyncSession, user_id: int, kb_id: str) -> bool:
    """KB를 삭제합니다."""
    kb = await get_knowledge_base(db, user_id, kb_id)
    if not kb:
        return False
    await db.delete(kb)
    await db.commit()
    return True


# ============================================================
# KnowledgeFile CRUD
# ============================================================

async def create_knowledge_file(db: AsyncSession, kb_pk: int, filename: str,
                                 original_filename: str, file_size_bytes: int = 0) -> KnowledgeFile:
    """파일 메타데이터를 생성합니다 (status=processing)."""
    kf = KnowledgeFile(
        kb_pk=kb_pk,
        filename=filename,
        original_filename=original_filename,
        file_size_bytes=file_size_bytes,
        status="processing",
    )
    db.add(kf)
    await db.commit()
    await db.refresh(kf)
    return kf


async def update_file_status(db: AsyncSession, file_id: int, status: str,
                              chunk_count: int = 0, error_message: str = None):
    """파일 처리 상태를 업데이트합니다."""
    stmt = select(KnowledgeFile).where(KnowledgeFile.id == file_id)
    result = await db.execute(stmt)
    kf = result.scalar_one_or_none()
    if kf:
        kf.status = status
        kf.chunk_count = chunk_count
        if error_message:
            kf.error_message = error_message
        await db.commit()


async def get_files_for_kb(db: AsyncSession, kb_pk: int) -> List[KnowledgeFile]:
    """KB의 파일 목록을 반환합니다."""
    stmt = (
        select(KnowledgeFile)
        .where(KnowledgeFile.kb_pk == kb_pk)
        .order_by(KnowledgeFile.uploaded_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
