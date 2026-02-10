"""
채팅 세션 API 엔드포인트
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.session import (
    SessionCreate, SessionUpdate, SessionResponse,
    SessionDetailResponse, SessionListResponse,
    MessageCreate, MessageResponse,
)
from app.crud.session import (
    list_sessions, get_session, create_session, update_session, delete_session,
    add_message, get_messages,
)
from app.crud.agent import get_agent

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=SessionListResponse)
async def list_sessions_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """세션 목록을 반환합니다 (최신순)."""
    rows = await list_sessions(db, current_user.id, limit, offset)
    return SessionListResponse(sessions=[SessionResponse(**r) for r in rows])


@router.post("", response_model=SessionResponse)
async def create_session_endpoint(
    data: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """세션을 생성합니다."""
    agent_pk = None
    agent_id_str = None
    if data.agent_id:
        agent = await get_agent(db, current_user.id, data.agent_id)
        if agent:
            agent_pk = agent.id
            agent_id_str = agent.agent_id

    s = await create_session(db, current_user.id, data.title, data.session_id, agent_pk)
    return SessionResponse(
        id=s.id, session_id=s.session_id, title=s.title,
        agent_id=agent_id_str, message_count=0,
        created_at=s.created_at, updated_at=s.updated_at,
    )


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session_endpoint(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """세션 상세 + 메시지를 반환합니다."""
    s = await get_session(db, current_user.id, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    agent_id_str = None
    if s.agent:
        agent_id_str = s.agent.agent_id

    messages = [MessageResponse.model_validate(m) for m in s.messages]
    return SessionDetailResponse(
        id=s.id, session_id=s.session_id, title=s.title,
        agent_id=agent_id_str, message_count=len(messages),
        created_at=s.created_at, updated_at=s.updated_at,
        messages=messages,
    )


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session_endpoint(
    session_id: str,
    data: SessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """세션 제목을 수정합니다."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="수정할 내용이 없습니다.")
    s = await update_session(db, current_user.id, session_id, updates)
    if not s:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    return SessionResponse(
        id=s.id, session_id=s.session_id, title=s.title,
        agent_id=None, message_count=0,
        created_at=s.created_at, updated_at=s.updated_at,
    )


@router.delete("/{session_id}")
async def delete_session_endpoint(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """세션을 삭제합니다."""
    deleted = await delete_session(db, current_user.id, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    return {"message": "세션이 삭제되었습니다."}


@router.post("/{session_id}/messages", response_model=MessageResponse)
async def add_message_endpoint(
    session_id: str,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """세션에 메시지를 추가합니다."""
    s = await get_session(db, current_user.id, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    msg = await add_message(db, s.id, data.role, data.content, data.thinking, data.metadata_json)
    return MessageResponse.model_validate(msg)


@router.get("/{session_id}/messages")
async def get_messages_endpoint(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """세션의 메시지를 조회합니다."""
    s = await get_session(db, current_user.id, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    msgs = await get_messages(db, s.id, limit, offset)
    return {"messages": [MessageResponse.model_validate(m) for m in msgs]}
