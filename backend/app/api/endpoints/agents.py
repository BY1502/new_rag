"""
에이전트 API 엔드포인트
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.agent import (
    AgentCreate, AgentUpdate, AgentResponse, AgentListResponse,
)
from app.crud.agent import (
    list_agents, get_agent, create_agent, update_agent, delete_agent,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=AgentListResponse)
async def list_agents_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """사용자의 에이전트 목록을 반환합니다."""
    agents = await list_agents(db, current_user.id)
    return AgentListResponse(agents=[AgentResponse.model_validate(a) for a in agents])


@router.post("", response_model=AgentResponse)
async def create_agent_endpoint(
    data: AgentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """에이전트를 생성합니다."""
    existing = await get_agent(db, current_user.id, data.agent_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"에이전트 '{data.agent_id}'가 이미 존재합니다.")
    agent = await create_agent(db, current_user.id, **data.model_dump())
    return AgentResponse.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent_endpoint(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """에이전트 상세 정보를 반환합니다."""
    agent = await get_agent(db, current_user.id, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="에이전트를 찾을 수 없습니다.")
    return AgentResponse.model_validate(agent)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent_endpoint(
    agent_id: str,
    data: AgentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """에이전트를 수정합니다."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="수정할 내용이 없습니다.")
    agent = await update_agent(db, current_user.id, agent_id, updates)
    if not agent:
        raise HTTPException(status_code=404, detail="에이전트를 찾을 수 없습니다.")
    return AgentResponse.model_validate(agent)


@router.delete("/{agent_id}")
async def delete_agent_endpoint(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """에이전트를 삭제합니다."""
    deleted = await delete_agent(db, current_user.id, agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="에이전트를 찾을 수 없습니다.")
    return {"message": f"에이전트 '{agent_id}'가 삭제되었습니다."}
