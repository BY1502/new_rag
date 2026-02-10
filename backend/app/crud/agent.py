"""
에이전트 CRUD
"""
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent


async def list_agents(db: AsyncSession, user_id: int) -> List[Agent]:
    stmt = (
        select(Agent)
        .where(Agent.user_id == user_id)
        .order_by(Agent.sort_order, Agent.created_at)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_agent(db: AsyncSession, user_id: int, agent_id: str) -> Optional[Agent]:
    stmt = select(Agent).where(Agent.user_id == user_id, Agent.agent_id == agent_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_agent_by_pk(db: AsyncSession, pk: int) -> Optional[Agent]:
    stmt = select(Agent).where(Agent.id == pk)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_agent(db: AsyncSession, user_id: int, **kwargs) -> Agent:
    agent = Agent(user_id=user_id, **kwargs)
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def update_agent(db: AsyncSession, user_id: int, agent_id: str, updates: dict) -> Optional[Agent]:
    agent = await get_agent(db, user_id, agent_id)
    if not agent:
        return None
    for k, v in updates.items():
        if hasattr(agent, k):
            setattr(agent, k, v)
    await db.commit()
    await db.refresh(agent)
    return agent


async def delete_agent(db: AsyncSession, user_id: int, agent_id: str) -> bool:
    agent = await get_agent(db, user_id, agent_id)
    if not agent:
        return False
    await db.delete(agent)
    await db.commit()
    return True
