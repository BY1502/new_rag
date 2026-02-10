"""
에이전트 Pydantic 스키마
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class AgentCreate(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=5000)
    model: str = Field("gemma3:12b", max_length=100)
    system_prompt: str = Field("", max_length=10000)
    icon: str = Field("", max_length=50)
    color: str = Field("", max_length=20)
    published: bool = True


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    model: Optional[str] = Field(None, max_length=100)
    system_prompt: Optional[str] = Field(None, max_length=10000)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    published: Optional[bool] = None
    sort_order: Optional[int] = None


class AgentResponse(BaseModel):
    id: int
    agent_id: str
    name: str
    description: str
    model: str
    system_prompt: str
    icon: str
    color: str
    published: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentListResponse(BaseModel):
    agents: List[AgentResponse]
