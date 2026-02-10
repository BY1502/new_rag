"""설정 관련 스키마"""
from pydantic import BaseModel, Field
from typing import Optional, List


class BackendConfigResponse(BaseModel):
    """백엔드 현재 설정 반환"""
    # LLM
    llm_model: str
    llm_temperature: float
    ollama_base_url: str

    # Embedding
    embedding_model: str

    # Vector DB
    qdrant_url: str

    # Neo4j
    neo4j_url: str
    neo4j_username: str

    # Redis
    redis_url: str
    redis_connected: bool = False

    # RAG
    rag_top_k: int
    rag_chunk_size: int
    rag_chunk_overlap: int

    # Cache
    cache_enabled: bool
    cache_ttl_seconds: int


class ApiKeyCreate(BaseModel):
    provider: str = Field(..., min_length=1, max_length=50, description="Provider (serper, openai, anthropic 등)")
    key: str = Field(..., min_length=1, description="API 키 값")


class ApiKeyResponse(BaseModel):
    provider: str
    masked_key: str


class ApiKeysListResponse(BaseModel):
    keys: List[ApiKeyResponse]
