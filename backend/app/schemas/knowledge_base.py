"""
지식 베이스 Pydantic 스키마
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class KnowledgeBaseCreate(BaseModel):
    kb_id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=2000)
    chunk_size: int = Field(512, ge=100, le=4096)
    chunk_overlap: int = Field(50, ge=0, le=500)
    external_service_id: Optional[str] = None


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    chunk_size: Optional[int] = Field(None, ge=100, le=4096)
    chunk_overlap: Optional[int] = Field(None, ge=0, le=500)
    external_service_id: Optional[str] = None


class KnowledgeFileResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size_bytes: int
    chunk_count: int
    status: str
    error_message: Optional[str] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True


class KnowledgeBaseResponse(BaseModel):
    id: int
    kb_id: str
    name: str
    description: str
    chunk_size: int
    chunk_overlap: int
    external_service_id: Optional[str] = None
    file_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class KnowledgeBaseListResponse(BaseModel):
    bases: List[KnowledgeBaseResponse]
