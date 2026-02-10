"""
외부 서비스 스키마
"""
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

_ALLOWED_SERVICE_TYPES = {"qdrant", "postgresql", "pinecone"}


class ExternalServiceCreate(BaseModel):
    service_id: str
    name: str
    service_type: str  # qdrant | postgresql | pinecone

    @field_validator("service_type")
    @classmethod
    def validate_service_type(cls, v: str) -> str:
        if v not in _ALLOWED_SERVICE_TYPES:
            raise ValueError(f"service_type must be one of {_ALLOWED_SERVICE_TYPES}")
        return v
    url: Optional[str] = ""
    api_key: Optional[str] = None
    username: Optional[str] = ""
    password: Optional[str] = None
    database: Optional[str] = ""
    port: Optional[int] = None
    is_default: Optional[bool] = False


class ExternalServiceUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    api_key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    database: Optional[str] = None
    port: Optional[int] = None
    is_default: Optional[bool] = None


class ExternalServiceResponse(BaseModel):
    service_id: str
    name: str
    service_type: str
    url: str
    username: str
    database: str
    port: Optional[int]
    is_default: bool
    has_api_key: bool
    has_password: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ExternalServiceListResponse(BaseModel):
    services: list[ExternalServiceResponse]
