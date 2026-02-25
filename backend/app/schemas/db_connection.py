"""DB 연결 관련 스키마"""
from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class DBConnectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="연결 이름")
    db_type: Literal["postgresql", "mysql", "sqlite"] = Field(..., description="DB 종류")
    host: str = Field(default="localhost", max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(..., min_length=1, max_length=255, description="데이터베이스명")
    username: str = Field(default="", max_length=255)
    password: str = Field(default="", max_length=255)
    schema_metadata: Optional[str] = Field(default=None, description="비즈니스 메타데이터 (JSON)")


class DBConnectionResponse(BaseModel):
    id: str
    name: str
    db_type: str
    host: str
    port: int
    database: str
    username: str
    schema_metadata: Optional[str] = None


class DBConnectionMetadataUpdate(BaseModel):
    schema_metadata: str = Field(..., description="비즈니스 메타데이터 (JSON)")


class DBConnectionListResponse(BaseModel):
    connections: List[DBConnectionResponse]
