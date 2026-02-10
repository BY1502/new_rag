"""
채팅 세션 + 메시지 CRUD
"""
import uuid
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat_session import ChatSession, ChatMessage
from app.models.agent import Agent


async def list_sessions(db: AsyncSession, user_id: int, limit: int = 50, offset: int = 0) -> List[dict]:
    """세션 목록 (메시지 수 포함, 최신순)"""
    stmt = (
        select(
            ChatSession,
            func.count(ChatMessage.id).label("message_count"),
            Agent.agent_id.label("agent_id_str"),
        )
        .outerjoin(ChatMessage, ChatMessage.session_pk == ChatSession.id)
        .outerjoin(Agent, Agent.id == ChatSession.agent_pk)
        .where(ChatSession.user_id == user_id)
        .group_by(ChatSession.id, Agent.agent_id)
        .order_by(ChatSession.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id": s.id,
            "session_id": s.session_id,
            "title": s.title,
            "agent_id": agent_id_str,
            "message_count": msg_count,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }
        for s, msg_count, agent_id_str in rows
    ]


async def get_session(db: AsyncSession, user_id: int, session_id: str) -> Optional[ChatSession]:
    stmt = (
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.user_id == user_id, ChatSession.session_id == session_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_session(db: AsyncSession, user_id: int, title: str = "새로운 대화",
                          session_id: str = None, agent_pk: int = None) -> ChatSession:
    s = ChatSession(
        session_id=session_id or str(uuid.uuid4()),
        user_id=user_id,
        agent_pk=agent_pk,
        title=title,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s


async def update_session(db: AsyncSession, user_id: int, session_id: str, updates: dict) -> Optional[ChatSession]:
    s = await get_session(db, user_id, session_id)
    if not s:
        return None
    for k, v in updates.items():
        if hasattr(s, k):
            setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return s


async def delete_session(db: AsyncSession, user_id: int, session_id: str) -> bool:
    stmt = select(ChatSession).where(
        ChatSession.user_id == user_id, ChatSession.session_id == session_id
    )
    result = await db.execute(stmt)
    s = result.scalar_one_or_none()
    if not s:
        return False
    await db.delete(s)
    await db.commit()
    return True


# ============================================================
# 메시지 CRUD
# ============================================================

async def add_message(db: AsyncSession, session_pk: int, role: str, content: str,
                       thinking: str = None, metadata_json: str = None) -> ChatMessage:
    msg = ChatMessage(
        session_pk=session_pk,
        role=role,
        content=content,
        thinking=thinking,
        metadata_json=metadata_json,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def get_messages(db: AsyncSession, session_pk: int, limit: int = 100, offset: int = 0) -> List[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_pk == session_pk)
        .order_by(ChatMessage.created_at)
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
