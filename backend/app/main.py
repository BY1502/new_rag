"""
RAG AI Backend - FastAPI 애플리케이션
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.api import api_router
from app.db.session import engine
from app.db.base import Base
from app.services.cache_service import get_cache_service

# 모든 모델 import (create_all에 필요)
import app.models.user  # noqa: F401
import app.models.user_settings  # noqa: F401
import app.models.api_key  # noqa: F401
import app.models.knowledge_base  # noqa: F401
import app.models.agent  # noqa: F401
import app.models.chat_session  # noqa: F401
import app.models.mcp_server  # noqa: F401
import app.models.db_connection  # noqa: F401
import app.models.external_service  # noqa: F401
import app.models.conversation_feedback  # noqa: F401

# 로깅 설정
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format=settings.LOG_FORMAT
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 라이프사이클 관리"""
    logger.info(f"Starting {settings.PROJECT_NAME} ({settings.ENVIRONMENT})")

    # Startup
    # 1. DB 테이블 자동 생성 (개발 환경)
    if settings.ENVIRONMENT == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created (development mode)")

    # 2. Redis 연결
    cache = get_cache_service()
    redis_connected = await cache.connect()
    if redis_connected:
        logger.info("Redis connected")
    else:
        logger.warning("Redis connection failed - using in-memory fallback")

    yield

    # Shutdown
    logger.info("Shutting down...")

    # MCP 연결 해제
    try:
        from app.services.tool_registry import ToolRegistry
        await ToolRegistry.disconnect_all()
    except Exception as e:
        logger.warning(f"MCP cleanup error: {e}")

    # Redis 연결 해제
    await cache.disconnect()

    # DB 연결 해제
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="RAG AI Backend API",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# CORS 설정 - 환경변수에서 읽어옴
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
def read_root():
    """루트 엔드포인트"""
    return {
        "message": "Welcome to RAG AI API Server",
        "version": "1.0.0",
        "docs": "/docs" if settings.DEBUG else "disabled"
    }


@app.get("/health")
async def health_check():
    """헬스 체크 엔드포인트"""
    cache = get_cache_service()

    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "services": {
            "redis": cache.is_connected,
            "database": True
        }
    }


@app.get("/health/{service}")
async def health_check_service(service: str):
    """개별 서비스 연결 테스트"""
    if service == "redis":
        cache = get_cache_service()
        if cache.is_connected:
            try:
                await cache._client.ping()
                return {"status": "connected", "service": "redis", "detail": "Redis 연결 성공"}
            except Exception as e:
                return {"status": "disconnected", "service": "redis", "detail": f"Redis ping 실패: {e}"}
        return {"status": "disconnected", "service": "redis", "detail": "Redis에 연결되어 있지 않습니다."}

    elif service == "neo4j":
        try:
            from neo4j import GraphDatabase
            driver = GraphDatabase.driver(
                settings.NEO4J_URL,
                auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
            )
            driver.verify_connectivity()
            driver.close()
            return {"status": "connected", "service": "neo4j", "detail": "Neo4j 연결 성공"}
        except Exception as e:
            return {"status": "disconnected", "service": "neo4j", "detail": f"Neo4j 연결 실패: {e}"}

    elif service == "qdrant":
        try:
            from qdrant_client import QdrantClient
            client = QdrantClient(url=settings.QDRANT_URL, timeout=5)
            client.get_collections()
            return {"status": "connected", "service": "qdrant", "detail": "Qdrant 연결 성공"}
        except Exception as e:
            return {"status": "disconnected", "service": "qdrant", "detail": f"Qdrant 연결 실패: {e}"}

    elif service == "ollama":
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
                if resp.status_code == 200:
                    models_list = resp.json().get("models", [])
                    names = [m.get("name", "") for m in models_list[:5]]
                    return {"status": "connected", "service": "ollama", "detail": f"Ollama 연결 성공 (모델: {', '.join(names)})"}
            return {"status": "disconnected", "service": "ollama", "detail": "Ollama 응답 오류"}
        except Exception as e:
            return {"status": "disconnected", "service": "ollama", "detail": f"Ollama 연결 실패: {e}"}

    return {"status": "error", "service": service, "detail": f"알 수 없는 서비스: {service}"}
