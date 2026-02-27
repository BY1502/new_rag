"""
설정 API 엔드포인트
- 사용자별 설정 (DB 저장)
- API 키 관리 (암호화 DB 저장)
- Ollama 모델 목록 조회
- DB 연결 관리 (DB 영구 저장)
- MCP 서버 관리 (DB 영구 저장)
"""
import logging
import uuid
from typing import List
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.settings import (
    BackendConfigResponse,
    ApiKeyCreate,
    ApiKeyResponse,
    ApiKeysListResponse
)
from app.schemas.user_settings import UserSettingsResponse, UserSettingsUpdate
from app.schemas.db_connection import (
    DBConnectionCreate,
    DBConnectionResponse,
    DBConnectionListResponse,
    DBConnectionMetadataUpdate,
)
from app.api.deps import get_current_user
from app.models.user import User
from app.models.db_connection import DbConnection
from app.models.mcp_server import McpServer
from app.core.config import settings
from app.core.encryption import decrypt_value, encrypt_value
from app.services.cache_service import get_cache_service
from app.db.session import get_db
from app.crud.user_settings import get_or_create_settings, update_user_settings
from app.crud.api_key import (
    get_api_keys_for_user,
    get_api_key_value,
    save_api_key as crud_save_api_key,
    delete_api_key as crud_delete_api_key,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_db_connection_for_user(user_id: int, conn_id: str) -> dict | None:
    """내부 서비스에서 DB 연결 설정을 조회합니다 (자체 DB 세션 사용)."""
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stmt = select(DbConnection).where(
            DbConnection.user_id == user_id, DbConnection.conn_id == conn_id
        )
        result = await db.execute(stmt)
        conn = result.scalar_one_or_none()
        if not conn:
            return None
        password = ""
        if conn.encrypted_password:
            try:
                password = decrypt_value(conn.encrypted_password)
            except Exception:
                pass
        return {
            "id": conn.conn_id, "name": conn.name, "db_type": conn.db_type,
            "host": conn.host, "port": conn.port, "database": conn.database,
            "username": conn.username, "password": password,
            "schema_metadata": conn.schema_metadata,
        }


def _build_connection_uri(conn: dict) -> str:
    """DB 연결 설정으로 SQLAlchemy URI를 생성합니다."""
    db_type = conn["db_type"]
    if db_type == "postgresql":
        return f"postgresql://{conn['username']}:{conn['password']}@{conn['host']}:{conn['port']}/{conn['database']}"
    elif db_type == "mysql":
        return f"mysql+pymysql://{conn['username']}:{conn['password']}@{conn['host']}:{conn['port']}/{conn['database']}"
    elif db_type == "sqlite":
        return f"sqlite:///{conn['database']}"
    raise ValueError(f"Unsupported db_type: {db_type}")


async def get_api_key_for_user(user_id: int, provider: str) -> str | None:
    """내부 서비스에서 사용자의 API 키를 조회합니다 (자체 DB 세션 사용)."""
    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        return await get_api_key_value(db, user_id, provider)


# ============================================================
# 사용자 설정
# ============================================================

@router.get("/user", response_model=UserSettingsResponse)
async def get_user_settings_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """사용자 설정을 조회합니다 (없으면 기본값 생성)."""
    s = await get_or_create_settings(db, current_user.id)
    return s


@router.put("/user", response_model=UserSettingsResponse)
async def update_user_settings_endpoint(
    data: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """사용자 설정을 부분 업데이트합니다."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        s = await get_or_create_settings(db, current_user.id)
        return s
    s = await update_user_settings(db, current_user.id, updates)
    return s


# ============================================================
# 백엔드 시스템 설정 (읽기 전용)
# ============================================================

@router.get("/config", response_model=BackendConfigResponse)
async def get_backend_config(current_user: User = Depends(get_current_user)):
    """현재 백엔드 시스템 설정을 반환합니다."""
    cache = get_cache_service()
    return BackendConfigResponse(
        llm_model=settings.LLM_MODEL,
        llm_temperature=settings.LLM_TEMPERATURE,
        ollama_base_url=settings.OLLAMA_BASE_URL,
        embedding_model=settings.EMBEDDING_MODEL,
        qdrant_url=settings.QDRANT_URL,
        neo4j_url=settings.NEO4J_URL,
        neo4j_username=settings.NEO4J_USERNAME,
        redis_url=settings.REDIS_URL,
        redis_connected=cache.is_connected,
        rag_top_k=settings.RAG_TOP_K,
        rag_chunk_size=settings.RAG_CHUNK_SIZE,
        rag_chunk_overlap=settings.RAG_CHUNK_OVERLAP,
        cache_enabled=settings.CACHE_ENABLED,
        cache_ttl_seconds=settings.CACHE_TTL_SECONDS,
    )


# ============================================================
# API 키 관리 (암호화 DB 저장)
# ============================================================

@router.post("/api-keys")
async def save_api_key_endpoint(
    data: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """API 키를 암호화하여 DB에 저장합니다."""
    await crud_save_api_key(db, current_user.id, data.provider, data.key)
    logger.info(f"API key saved for provider: {data.provider} (user: {current_user.id})")
    return {"message": f"{data.provider} API 키가 저장되었습니다."}


@router.get("/api-keys", response_model=ApiKeysListResponse)
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """저장된 API 키 목록을 반환합니다 (마스킹 처리)."""
    key_rows = await get_api_keys_for_user(db, current_user.id)
    keys = []
    for row in key_rows:
        try:
            plain = decrypt_value(row.encrypted_key)
            if len(plain) > 7:
                masked = plain[:4] + "***" + plain[-3:]
            else:
                masked = "***"
        except Exception:
            masked = "***"
        keys.append(ApiKeyResponse(provider=row.provider, masked_key=masked))
    return ApiKeysListResponse(keys=keys)


@router.delete("/api-keys/{provider}")
async def delete_api_key_endpoint(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """API 키를 삭제합니다."""
    deleted = await crud_delete_api_key(db, current_user.id, provider)
    if deleted:
        logger.info(f"API key deleted for provider: {provider} (user: {current_user.id})")
        return {"message": f"{provider} API 키가 삭제되었습니다."}
    return {"message": f"{provider} API 키를 찾을 수 없습니다."}


# ============================================================
# Ollama 모델 목록
# ============================================================

@router.get("/ollama-models")
async def get_ollama_models(current_user: User = Depends(get_current_user)):
    """Ollama에서 사용 가능한 모델 목록을 반환합니다."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()

        # 한국어 특화 모델 식별
        KOREAN_MODELS = {"exaone", "eeve", "bllossom", "kullm", "ko-", "korean"}

        models: List[dict] = []
        for m in data.get("models", []):
            name = m.get("name", "")
            size_bytes = m.get("size", 0)
            size_gb = round(size_bytes / (1024**3), 1) if size_bytes else 0
            param_size = m.get("details", {}).get("parameter_size", "")
            family = m.get("details", {}).get("family", "")
            quant = m.get("details", {}).get("quantization_level", "")
            is_korean = any(k in name.lower() for k in KOREAN_MODELS)
            models.append({
                "name": name,
                "size_gb": size_gb,
                "parameter_size": param_size,
                "family": family,
                "quantization": quant,
                "is_korean": is_korean,
            })

        return {"models": models, "ollama_url": settings.OLLAMA_BASE_URL}
    except httpx.ConnectError:
        logger.warning("Ollama server not reachable")
        return {"models": [], "ollama_url": settings.OLLAMA_BASE_URL, "error": "Ollama 서버에 연결할 수 없습니다."}
    except Exception as e:
        logger.error(f"Failed to fetch Ollama models: {e}")
        return {"models": [], "ollama_url": settings.OLLAMA_BASE_URL, "error": str(e)}


# ============================================================
# 통합 모델 목록 (Ollama + 외부 API)
# ============================================================

@router.get("/available-models")
async def get_available_models(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    사용 가능한 모든 모델 목록을 반환합니다.
    - Ollama 로컬 모델
    - 등록된 API 키로 사용 가능한 외부 모델 (OpenAI, Anthropic 등)
    """
    all_models = []

    # 1. Ollama 로컬 모델
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()

        # 한국어 특화 모델 식별
        KOREAN_MODELS = {"exaone", "eeve", "bllossom", "kullm", "ko-", "korean"}

        for m in data.get("models", []):
            name = m.get("name", "")
            param_size = m.get("details", {}).get("parameter_size", "")
            family = m.get("details", {}).get("family", "")

            # 한국어 모델 태그
            is_korean = any(k in name.lower() for k in KOREAN_MODELS)
            lang_tag = " [한국어]" if is_korean else ""

            all_models.append({
                "name": name,
                "provider": "ollama",
                "display_name": f"{name}{lang_tag} {f'({param_size})' if param_size else ''}".strip(),
                "type": "local",
                "is_korean": is_korean,
            })
    except Exception as e:
        logger.warning(f"Ollama 모델 로드 실패: {e}")

    # 2. 외부 API 모델 (저장된 API 키 확인)
    from app.crud.api_key import get_api_keys_for_user

    key_rows = await get_api_keys_for_user(db, current_user.id)
    available_providers = {row.provider for row in key_rows}
    logger.info(f"사용자 {current_user.id} 등록된 API 프로바이더: {available_providers}")

    # provider 이름 정규화 (프론트엔드에서 'google gemini' 등으로 저장될 수 있음)
    def has_provider(name: str) -> bool:
        return any(name in p for p in available_providers)

    # OpenAI 모델
    if has_provider("openai"):
        openai_models = [
            {"name": "gpt-4o", "display_name": "GPT-4o", "provider": "openai", "type": "api"},
            {"name": "gpt-4o-mini", "display_name": "GPT-4o Mini", "provider": "openai", "type": "api"},
            {"name": "gpt-4-turbo", "display_name": "GPT-4 Turbo", "provider": "openai", "type": "api"},
            {"name": "gpt-3.5-turbo", "display_name": "GPT-3.5 Turbo", "provider": "openai", "type": "api"},
        ]
        all_models.extend(openai_models)

    # Anthropic 모델
    if has_provider("anthropic"):
        anthropic_models = [
            {"name": "claude-sonnet-4-5-20250929", "display_name": "Claude 4.5 Sonnet", "provider": "anthropic", "type": "api"},
            {"name": "claude-opus-4-6", "display_name": "Claude Opus 4.6", "provider": "anthropic", "type": "api"},
            {"name": "claude-haiku-4-5-20251001", "display_name": "Claude 4.5 Haiku", "provider": "anthropic", "type": "api"},
        ]
        all_models.extend(anthropic_models)

    # Google AI 모델 (프론트엔드에서 'google gemini'으로 저장됨)
    if has_provider("google") or has_provider("gemini"):
        google_models = [
            {"name": "gemini-2.0-flash", "display_name": "Gemini 2.0 Flash", "provider": "google", "type": "api"},
            {"name": "gemini-2.0-pro", "display_name": "Gemini 2.0 Pro", "provider": "google", "type": "api"},
            {"name": "gemini-1.5-flash", "display_name": "Gemini 1.5 Flash", "provider": "google", "type": "api"},
        ]
        all_models.extend(google_models)

    # Groq 모델
    if has_provider("groq"):
        groq_models = [
            {"name": "llama-3.3-70b-versatile", "display_name": "Llama 3.3 70B", "provider": "groq", "type": "api"},
            {"name": "llama-3.1-8b-instant", "display_name": "Llama 3.1 8B Instant", "provider": "groq", "type": "api"},
            {"name": "mixtral-8x7b-32768", "display_name": "Mixtral 8x7B", "provider": "groq", "type": "api"},
        ]
        all_models.extend(groq_models)

    return {"models": all_models, "total": len(all_models)}


# ============================================================
# DB 연결 관리 (DB 영구 저장)
# ============================================================

@router.post("/db-connections")
async def create_db_connection(
    data: DBConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """외부 DB 연결을 등록합니다."""
    conn_id = str(uuid.uuid4())[:8]
    encrypted_pw = encrypt_value(data.password) if data.password else None
    conn = DbConnection(
        user_id=current_user.id, conn_id=conn_id, name=data.name,
        db_type=data.db_type, host=data.host, port=data.port,
        database=data.database, username=data.username,
        encrypted_password=encrypted_pw,
        schema_metadata=data.schema_metadata,
    )
    db.add(conn)
    await db.commit()
    logger.info(f"DB connection created: {data.name} ({data.db_type})")
    return {"message": f"{data.name} 연결이 등록되었습니다.", "id": conn_id}


@router.get("/db-connections", response_model=DBConnectionListResponse)
async def list_db_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """등록된 DB 연결 목록을 반환합니다 (비밀번호 제외)."""
    stmt = select(DbConnection).where(DbConnection.user_id == current_user.id)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    connections = [
        DBConnectionResponse(
            id=c.conn_id, name=c.name, db_type=c.db_type,
            host=c.host, port=c.port, database=c.database,
            username=c.username, schema_metadata=c.schema_metadata,
        )
        for c in rows
    ]
    return DBConnectionListResponse(connections=connections)


@router.delete("/db-connections/{conn_id}")
async def delete_db_connection(
    conn_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DB 연결을 삭제합니다."""
    stmt = select(DbConnection).where(
        DbConnection.user_id == current_user.id, DbConnection.conn_id == conn_id
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="연결을 찾을 수 없습니다.")
    await db.delete(conn)
    await db.commit()
    logger.info(f"DB connection deleted: {conn.name}")
    return {"message": f"{conn.name} 연결이 삭제되었습니다."}


@router.post("/db-connections/{conn_id}/test")
async def test_db_connection(
    conn_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DB 연결을 테스트합니다."""
    conn_dict = await get_db_connection_for_user(current_user.id, conn_id)
    if not conn_dict:
        raise HTTPException(status_code=404, detail="연결을 찾을 수 없습니다.")
    try:
        from sqlalchemy import create_engine, text
        uri = _build_connection_uri(conn_dict)
        eng = create_engine(uri, connect_args={"connect_timeout": 5} if conn_dict["db_type"] != "sqlite" else {})
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
        eng.dispose()
        return {"status": "connected", "detail": f"{conn_dict['name']} 연결 성공"}
    except Exception as e:
        return {"status": "disconnected", "detail": str(e)}


@router.get("/db-connections/{conn_id}/schema")
async def get_db_schema(
    conn_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DB 테이블 스키마를 조회합니다."""
    conn_dict = await get_db_connection_for_user(current_user.id, conn_id)
    if not conn_dict:
        raise HTTPException(status_code=404, detail="연결을 찾을 수 없습니다.")
    try:
        from langchain_community.utilities import SQLDatabase
        uri = _build_connection_uri(conn_dict)
        sql_db = SQLDatabase.from_uri(uri)
        tables = []
        for table_name in sql_db.get_usable_table_names():
            info = sql_db.get_table_info_no_throw([table_name])
            tables.append({"name": table_name, "info": info})
        return {"tables": tables, "schema_metadata": conn_dict.get("schema_metadata")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"스키마 조회 실패: {e}")


@router.put("/db-connections/{conn_id}/metadata")
async def update_db_metadata(
    conn_id: str,
    data: DBConnectionMetadataUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DB 연결의 비즈니스 메타데이터를 업데이트합니다."""
    stmt = select(DbConnection).where(
        DbConnection.user_id == current_user.id, DbConnection.conn_id == conn_id
    )
    result = await db.execute(stmt)
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="연결을 찾을 수 없습니다.")
    conn.schema_metadata = data.schema_metadata
    await db.commit()
    logger.info(f"DB connection metadata updated: {conn.name}")
    return {"message": f"{conn.name} 메타데이터가 업데이트되었습니다."}


# ============================================================
# MCP 서버 관리 (DB 영구 저장)
# ============================================================

@router.get("/mcp-servers")
async def list_mcp_servers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """MCP 서버 목록을 반환합니다."""
    stmt = (
        select(McpServer)
        .where(McpServer.user_id == current_user.id)
        .order_by(McpServer.sort_order)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {"servers": [
        {
            # canonical
            "server_id": s.server_id, "name": s.name, "server_type": s.server_type,
            "url": s.url, "command": s.command, "headers_json": s.headers_json,
            "priority": s.priority, "enabled": s.enabled, "sort_order": s.sort_order,
            # backward-compat
            "id": s.server_id, "type": s.server_type,
        }
        for s in rows
    ]}


@router.post("/mcp-servers")
async def create_mcp_server(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """MCP 서버를 등록합니다."""
    server_id = data.get("server_id") or data.get("id") or str(uuid.uuid4())[:8]
    server_type = data.get("server_type") or data.get("type") or "sse"
    srv = McpServer(
        user_id=current_user.id, server_id=server_id,
        name=data.get("name", ""), server_type=server_type,
        url=data.get("url", ""), command=data.get("command", ""),
        headers_json=data.get("headers_json"), priority=data.get("priority", 0),
        enabled=data.get("enabled", True), sort_order=data.get("sort_order", 0),
    )
    db.add(srv)
    await db.commit()
    return {"message": f"MCP 서버 '{srv.name}'가 등록되었습니다.", "server_id": server_id, "id": server_id}


@router.delete("/mcp-servers/{server_id}")
async def delete_mcp_server(
    server_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """MCP 서버를 삭제합니다."""
    stmt = select(McpServer).where(
        McpServer.user_id == current_user.id, McpServer.server_id == server_id
    )
    result = await db.execute(stmt)
    srv = result.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="MCP 서버를 찾을 수 없습니다.")
    await db.delete(srv)
    await db.commit()
    return {"message": f"MCP 서버 '{srv.name}'가 삭제되었습니다."}


@router.put("/mcp-servers/reorder")
async def reorder_mcp_servers(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """MCP 서버 정렬 순서를 일괄 변경합니다."""
    # 지원 포맷:
    # 1) {"order":[{"id":"xxx","sort_order":0}, ...]}
    # 2) {"order":["id1","id2", ...]}
    # 3) {"server_ids":["id1","id2", ...]}
    order = []
    if isinstance(data.get("order"), list):
        raw_order = data.get("order", [])
        if raw_order and isinstance(raw_order[0], str):
            order = [{"id": sid, "sort_order": idx} for idx, sid in enumerate(raw_order)]
        else:
            order = raw_order
    elif isinstance(data.get("server_ids"), list):
        order = [{"id": sid, "sort_order": idx} for idx, sid in enumerate(data.get("server_ids", []))]

    stmt = select(McpServer).where(McpServer.user_id == current_user.id)
    result = await db.execute(stmt)
    servers = {s.server_id: s for s in result.scalars().all()}
    for item in order:
        srv = servers.get(item.get("id"))
        if srv:
            srv.sort_order = item.get("sort_order", 0)
    await db.commit()
    return {"message": "정렬 순서가 업데이트되었습니다."}
