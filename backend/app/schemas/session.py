"""
채팅 세션 + 메시지 Pydantic 스키마
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    session_id: Optional[str] = Field(None, max_length=100)
    agent_id: Optional[str] = Field(None, max_length=100)
    title: str = Field("새로운 대화", max_length=500)


class SessionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)


class MessageCreate(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant|system)$")
    content: str = Field("", max_length=100000)
    thinking: Optional[str] = Field(None, max_length=100000)
    metadata_json: Optional[str] = None


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    thinking: Optional[str] = None
    metadata_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: int
    session_id: str
    title: str
    agent_id: Optional[str] = None
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionDetailResponse(SessionResponse):
    messages: List[MessageResponse] = []


class SessionListResponse(BaseModel):
    sessions: List[SessionResponse]
