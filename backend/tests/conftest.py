"""
테스트 공통 설정 및 Fixtures
"""
import os
import sys
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# 환경변수 먼저 설정 (settings import 전)
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-characters-long")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("NEO4J_URL", "bolt://localhost:7687")
os.environ.setdefault("NEO4J_USERNAME", "neo4j")
os.environ.setdefault("NEO4J_PASSWORD", "test")
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("ENVIRONMENT", "development")

from app.db.base import Base
from app.models.user import User
from app.core.security import get_password_hash


# ============================================================
# 이벤트 루프
# ============================================================

@pytest.fixture(scope="session")
def event_loop():
    """세션 범위의 이벤트 루프"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ============================================================
# 데이터베이스 Fixtures
# ============================================================

@pytest.fixture(scope="session")
def test_engine():
    """테스트용 SQLite 비동기 엔진"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///./test.db",
        echo=False,
    )
    return engine


@pytest.fixture(scope="session")
async def setup_database(test_engine):
    """테스트 DB 테이블 생성"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session(test_engine, setup_database):
    """각 테스트별 DB 세션 (트랜잭션 롤백)"""
    async_session = sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        async with session.begin():
            yield session
        # 트랜잭션이 끝나면 자동 롤백


# ============================================================
# FastAPI 테스트 클라이언트
# ============================================================

@pytest.fixture
async def async_client(db_session):
    """FastAPI 비동기 테스트 클라이언트"""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.db.session import get_db
    from app.api.deps import get_current_user

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def authenticated_client(db_session):
    """인증된 테스트 클라이언트"""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.db.session import get_db
    from app.api.deps import get_current_user

    # 테스트 유저 생성
    test_user = User(
        id=1,
        email="test@example.com",
        name="테스트유저",
        hashed_password=get_password_hash("TestPass1"),
        is_active=True,
    )

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return test_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


# ============================================================
# Mock Fixtures
# ============================================================

@pytest.fixture
def mock_cache_service():
    """CacheService 모킹"""
    mock = AsyncMock()
    mock.is_connected = True
    mock.connect = AsyncMock(return_value=True)
    mock.disconnect = AsyncMock()
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock(return_value=True)
    mock.delete = AsyncMock(return_value=True)
    mock.get_json = AsyncMock(return_value=None)
    mock.set_json = AsyncMock(return_value=True)
    mock.check_rate_limit = AsyncMock(return_value=(True, 1, 0))
    return mock


@pytest.fixture
def mock_rag_service():
    """RAGService 모킹"""
    mock = AsyncMock()

    async def mock_generate(*args, **kwargs):
        yield '{"type": "content", "content": "테스트 응답"}\n'

    mock.generate_response = mock_generate
    return mock


@pytest.fixture
def test_user_data():
    """테스트 유저 데이터"""
    return {
        "email": "test@example.com",
        "password": "TestPass123",
        "name": "테스트유저",
    }
