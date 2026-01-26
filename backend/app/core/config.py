import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "RAG AI Backend"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    DATABASE_URL: str
    QDRANT_URL: str
    REDIS_URL: str
    
    # Local LLM
    OLLAMA_BASE_URL: str
    EMBEDDING_MODEL: str
    LLM_MODEL: str

    class Config:
        env_file = ".env"

settings = Settings()