import os
import logging
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from qdrant_client import models as qdrant_models
from app.services.ingestion import get_ingestion_service
from app.services.graph_store import get_graph_store_service
from app.services.vector_store import get_vector_store_service
from app.services.qdrant_resolver import resolve_qdrant_client
from app.api.deps import get_current_user
from app.models.user import User
from app.core.config import settings
from app.db.session import get_db
from app.schemas.knowledge import (
    NodeCreate, NodeUpdate, EdgeCreate,
    ALLOWED_LABELS, ALLOWED_RELATIONSHIP_TYPES,
)
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate, KnowledgeBaseUpdate,
    KnowledgeBaseResponse, KnowledgeBaseListResponse,
)
from app.crud.knowledge_base import (
    list_knowledge_bases, get_knowledge_base, create_knowledge_base,
    update_knowledge_base, delete_knowledge_base as crud_delete_kb,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================
# 지식 베이스 CRUD
# ============================================================

@router.get("/bases", response_model=KnowledgeBaseListResponse)
async def list_bases(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """사용자의 지식 베이스 목록을 반환합니다."""
    rows = await list_knowledge_bases(db, current_user.id)
    return KnowledgeBaseListResponse(bases=[KnowledgeBaseResponse(**r) for r in rows])


@router.post("/bases", response_model=KnowledgeBaseResponse)
async def create_base(
    data: KnowledgeBaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지식 베이스를 생성합니다."""
    existing = await get_knowledge_base(db, current_user.id, data.kb_id)
    if existing:
        raise HTTPException(status_code=409, detail=f"KB '{data.kb_id}'가 이미 존재합니다.")
    kb = await create_knowledge_base(
        db, current_user.id, data.kb_id, data.name,
        data.description, data.chunk_size, data.chunk_overlap,
        external_service_id=data.external_service_id,
        chunking_method=data.chunking_method,
        semantic_threshold=data.semantic_threshold,
    )
    return KnowledgeBaseResponse(
        id=kb.id, kb_id=kb.kb_id, name=kb.name, description=kb.description or "",
        chunk_size=kb.chunk_size, chunk_overlap=kb.chunk_overlap,
        external_service_id=kb.external_service_id,
        chunking_method=kb.chunking_method or "fixed",
        semantic_threshold=kb.semantic_threshold or 0.75,
        file_count=0, created_at=kb.created_at, updated_at=kb.updated_at,
    )


@router.get("/bases/{kb_id}", response_model=KnowledgeBaseResponse)
async def get_base(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지식 베이스 상세 정보를 반환합니다."""
    kb = await get_knowledge_base(db, current_user.id, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="지식 베이스를 찾을 수 없습니다.")
    return KnowledgeBaseResponse(
        id=kb.id, kb_id=kb.kb_id, name=kb.name, description=kb.description or "",
        chunk_size=kb.chunk_size, chunk_overlap=kb.chunk_overlap,
        external_service_id=kb.external_service_id,
        chunking_method=kb.chunking_method or "fixed",
        semantic_threshold=kb.semantic_threshold or 0.75,
        file_count=0, created_at=kb.created_at, updated_at=kb.updated_at,
    )


@router.put("/bases/{kb_id}", response_model=KnowledgeBaseResponse)
async def update_base(
    kb_id: str,
    data: KnowledgeBaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지식 베이스를 수정합니다."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="수정할 내용이 없습니다.")
    kb = await update_knowledge_base(db, current_user.id, kb_id, updates)
    if not kb:
        raise HTTPException(status_code=404, detail="지식 베이스를 찾을 수 없습니다.")
    return KnowledgeBaseResponse(
        id=kb.id, kb_id=kb.kb_id, name=kb.name, description=kb.description or "",
        chunk_size=kb.chunk_size, chunk_overlap=kb.chunk_overlap,
        external_service_id=kb.external_service_id,
        chunking_method=kb.chunking_method or "fixed",
        semantic_threshold=kb.semantic_threshold or 0.75,
        file_count=0, created_at=kb.created_at, updated_at=kb.updated_at,
    )


@router.delete("/bases/{kb_id}")
async def delete_base(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지식 베이스를 삭제합니다 (Qdrant 컬렉션도 함께 삭제)."""
    # 삭제 전에 외부 client resolve (KB row 필요)
    ext_client = await resolve_qdrant_client(db, current_user.id, kb_id)

    deleted = await crud_delete_kb(db, current_user.id, kb_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="지식 베이스를 찾을 수 없습니다.")

    # Qdrant 컬렉션 삭제
    try:
        vector_service = get_vector_store_service()
        client = vector_service.get_client(ext_client)
        collection_name = f"kb_{kb_id}"
        if client.collection_exists(collection_name):
            client.delete_collection(collection_name)
            logger.info(f"Qdrant collection deleted: {collection_name}")
    except Exception as e:
        logger.warning(f"Failed to delete Qdrant collection: {e}")

    return {"message": f"지식 베이스 '{kb_id}'가 삭제되었습니다."}


# ============================================================
# 파일 업로드 / 관리
# ============================================================

def validate_file(file: UploadFile) -> None:
    """파일 크기와 타입을 검증합니다."""
    logger.info(f"Validating file: {file.filename}")

    if file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        logger.info(f"File extension: '{ext}' | Allowed: {settings.allowed_extensions_list}")

        if ext not in settings.allowed_extensions_list:
            error_msg = f"허용되지 않는 파일 형식입니다 ('{ext}'). 허용 형식: {', '.join(settings.allowed_extensions_list)}"
            logger.error(f"File validation failed: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)

    if hasattr(file, 'size') and file.size:
        logger.info(f"File size: {file.size} bytes (max: {settings.max_upload_size_bytes})")
        if file.size > settings.max_upload_size_bytes:
            error_msg = f"파일 크기가 너무 큽니다. 최대 {settings.MAX_UPLOAD_SIZE_MB}MB까지 허용됩니다."
            logger.error(f"File validation failed: {error_msg}")
            raise HTTPException(status_code=413, detail=error_msg)

    logger.info("File validation passed")


@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    kb_id: str = Form("default_kb"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """파일을 업로드하고 백그라운드에서 처리합니다."""
    validate_file(file)
    ingestion_service = get_ingestion_service()

    # KB 설정 조회 (chunking_method, semantic_threshold, chunk_size, chunk_overlap)
    kb = await get_knowledge_base(db, current_user.id, kb_id)
    chunk_size = kb.chunk_size if kb else settings.RAG_CHUNK_SIZE
    chunk_overlap = kb.chunk_overlap if kb else settings.RAG_CHUNK_OVERLAP
    chunking_method = (kb.chunking_method if kb else "fixed") or "fixed"
    semantic_threshold = (kb.semantic_threshold if kb else 0.75) or 0.75

    # background task 전에 외부 client resolve (db session이 유효한 동안)
    ext_client = await resolve_qdrant_client(db, current_user.id, kb_id)

    try:
        file_path, original_filename = await ingestion_service.save_file(file, kb_id, current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 실패: {str(e)}")

    background_tasks.add_task(
        ingestion_service.process_file_background,
        file_path,
        original_filename,
        kb_id,
        current_user.id,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        chunking_method=chunking_method,
        semantic_threshold=semantic_threshold,
        qdrant_client=ext_client,
    )

    return {
        "message": f"파일({original_filename}) 업로드가 시작되었습니다. 백그라운드에서 처리 중입니다.",
        "filename": original_filename,
        "kb_id": kb_id
    }


# ============================================================
# 청크 조회
# ============================================================

@router.get("/{kb_id}/files")
async def get_files_list(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지식 베이스의 소스 파일 목록과 파일별 청크 수를 반환합니다."""
    ext_client = await resolve_qdrant_client(db, current_user.id, kb_id)
    vector_service = get_vector_store_service()
    client = vector_service.get_client(ext_client)
    collection_name = f"kb_{kb_id}"

    if not client.collection_exists(collection_name):
        return {"files": [], "kb_id": kb_id}

    user_filter = qdrant_models.Filter(
        must=[qdrant_models.FieldCondition(
            key="metadata.user_id",
            match=qdrant_models.MatchValue(value=current_user.id)
        )]
    )

    # 최대 2000개 스캔하여 고유 소스 파일과 청크 수 집계 (이미지 메타데이터 포함)
    file_data = {}  # source -> {count, metadata}
    scroll_offset = None
    scanned = 0
    while scanned < 2000:
        points, next_off = client.scroll(
            collection_name=collection_name,
            scroll_filter=user_filter,
            limit=200,
            offset=scroll_offset,
            with_payload=True,  # 전체 payload 가져오기
            with_vectors=False,
        )
        if not points:
            break
        for p in points:
            metadata = (p.payload or {}).get("metadata", {})
            src = metadata.get("source", "unknown")

            if src not in file_data:
                # 첫 번째 청크 메타데이터 저장 (이미지 정보 포함)
                file_data[src] = {
                    "count": 0,
                    "content_type": metadata.get("content_type", "text"),
                    "thumbnail_path": metadata.get("thumbnail_path"),
                    "image_path": metadata.get("image_path"),
                    "image_size": metadata.get("image_size"),
                    "image_dimensions": metadata.get("image_dimensions"),
                }
            file_data[src]["count"] += 1
        scanned += len(points)
        scroll_offset = next_off
        if not next_off:
            break

    files = []
    for source, data in sorted(file_data.items(), key=lambda x: x[0]):
        filename = source.rsplit("/", 1)[-1].rsplit("\\", 1)[-1] if source else "unknown"
        file_info = {
            "source": source,
            "filename": filename,
            "chunk_count": data["count"],
            "type": data["content_type"],
        }

        # 이미지 파일인 경우 썸네일 경로 추가
        if data["content_type"] == "image":
            if data.get("thumbnail_path"):
                file_info["thumbnail_path"] = data["thumbnail_path"]
            if data.get("image_path"):
                file_info["image_path"] = data["image_path"]
            if data.get("image_size"):
                file_info["image_size"] = data["image_size"]
            if data.get("image_dimensions"):
                file_info["image_dimensions"] = data["image_dimensions"]

        files.append(file_info)

    return {"files": files, "kb_id": kb_id}


@router.delete("/{kb_id}/files")
async def delete_file_chunks(
    kb_id: str,
    source: str = Query(..., description="삭제할 소스 파일 경로"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """소스 파일에 해당하는 모든 청크를 Qdrant에서 영구 삭제합니다."""
    ext_client = await resolve_qdrant_client(db, current_user.id, kb_id)
    vector_service = get_vector_store_service()
    client = vector_service.get_client(ext_client)
    collection_name = f"kb_{kb_id}"

    if not client.collection_exists(collection_name):
        raise HTTPException(status_code=404, detail="컬렉션이 존재하지 않습니다.")

    delete_filter = qdrant_models.Filter(
        must=[
            qdrant_models.FieldCondition(
                key="metadata.user_id",
                match=qdrant_models.MatchValue(value=current_user.id)
            ),
            qdrant_models.FieldCondition(
                key="metadata.source",
                match=qdrant_models.MatchValue(value=source)
            ),
        ]
    )

    # 삭제 전 개수 확인
    before_count = client.count(
        collection_name=collection_name,
        count_filter=delete_filter,
        exact=True
    ).count

    if before_count == 0:
        raise HTTPException(status_code=404, detail="해당 파일의 청크가 없습니다.")

    # Qdrant에서 필터 기반 삭제
    client.delete(
        collection_name=collection_name,
        points_selector=qdrant_models.FilterSelector(filter=delete_filter),
    )

    logger.info(f"Deleted {before_count} chunks for source={source} in {collection_name} by user {current_user.id}")

    return {
        "message": f"{before_count}개 청크가 삭제되었습니다.",
        "deleted_count": before_count,
        "source": source,
        "kb_id": kb_id,
    }


@router.get("/{kb_id}/chunks")
async def get_chunks(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    offset: Optional[str] = Query(None, description="페이지 오프셋 (Qdrant point ID)"),
    limit: int = Query(20, ge=1, le=100, description="페이지당 청크 수"),
    search: Optional[str] = Query(None, description="청크 내용 검색어 (시맨틱 검색)"),
    source: Optional[str] = Query(None, description="소스 파일 경로 필터"),
):
    """지식 베이스의 청크를 조회합니다."""
    ext_client = await resolve_qdrant_client(db, current_user.id, kb_id)
    vector_service = get_vector_store_service()
    client = vector_service.get_client(ext_client)
    collection_name = f"kb_{kb_id}"

    if not client.collection_exists(collection_name):
        return {"chunks": [], "total": 0, "next_offset": None, "kb_id": kb_id}

    filter_conditions = [
        qdrant_models.FieldCondition(
            key="metadata.user_id",
            match=qdrant_models.MatchValue(value=current_user.id)
        )
    ]
    if source:
        filter_conditions.append(
            qdrant_models.FieldCondition(
                key="metadata.source",
                match=qdrant_models.MatchValue(value=source)
            )
        )

    user_filter = qdrant_models.Filter(must=filter_conditions)

    # 총 개수
    total = client.count(
        collection_name=collection_name,
        count_filter=user_filter,
        exact=True
    ).count

    chunks = []

    if search and search.strip():
        # 시맨틱 검색
        query_vector = vector_service.embeddings.embed_query(search)
        results = client.query_points(
            collection_name=collection_name,
            query=query_vector,
            query_filter=user_filter,
            limit=limit,
            with_payload=True,
        )
        for point in results.points:
            payload = point.payload or {}
            meta = payload.get("metadata", {})
            chunk_data = {
                "id": str(point.id),
                "text": payload.get("page_content", ""),
                "metadata": meta,
                "chunk_index": meta.get("chunk_index", 0),
                "source": meta.get("source", "unknown"),
                "score": round(point.score, 4) if hasattr(point, 'score') and point.score else None,
                "content_type": meta.get("content_type", "text"),
            }
            # 이미지 메타데이터 추가
            if meta.get("content_type") == "image":
                chunk_data.update({
                    "image_path": meta.get("image_path"),
                    "thumbnail_path": meta.get("thumbnail_path"),
                    "caption": meta.get("caption"),
                    "ocr_text": meta.get("ocr_text"),
                    "image_dimensions": meta.get("image_dimensions"),
                })
            chunks.append(chunk_data)
        return {"chunks": chunks, "total": total, "next_offset": None, "kb_id": kb_id}
    else:
        # 스크롤 (페이지네이션)
        scroll_offset = offset if offset else None
        points, next_offset = client.scroll(
            collection_name=collection_name,
            scroll_filter=user_filter,
            limit=limit,
            offset=scroll_offset,
            with_payload=True,
            with_vectors=False,
        )
        for point in points:
            payload = point.payload or {}
            meta = payload.get("metadata", {})
            chunk_data = {
                "id": str(point.id),
                "text": payload.get("page_content", ""),
                "metadata": meta,
                "chunk_index": meta.get("chunk_index", 0),
                "source": meta.get("source", "unknown"),
                "content_type": meta.get("content_type", "text"),
            }
            # 이미지 메타데이터 추가
            if meta.get("content_type") == "image":
                chunk_data.update({
                    "image_path": meta.get("image_path"),
                    "thumbnail_path": meta.get("thumbnail_path"),
                    "caption": meta.get("caption"),
                    "ocr_text": meta.get("ocr_text"),
                    "image_dimensions": meta.get("image_dimensions"),
                })
            chunks.append(chunk_data)
        return {
            "chunks": chunks,
            "total": total,
            "next_offset": str(next_offset) if next_offset else None,
            "kb_id": kb_id
        }


# ============================================================
# KB 통계
# ============================================================

@router.get("/{kb_id}/stats")
async def get_kb_stats(
    kb_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """지식 베이스의 통계를 반환합니다."""
    ext_client = await resolve_qdrant_client(db, current_user.id, kb_id)
    vector_service = get_vector_store_service()
    client = vector_service.get_client(ext_client)
    graph_service = get_graph_store_service()
    collection_name = f"kb_{kb_id}"

    # 청크 수
    chunk_count = 0
    file_count = 0
    if client.collection_exists(collection_name):
        user_filter = qdrant_models.Filter(
            must=[qdrant_models.FieldCondition(
                key="metadata.user_id",
                match=qdrant_models.MatchValue(value=current_user.id)
            )]
        )
        chunk_count = client.count(
            collection_name=collection_name,
            count_filter=user_filter,
            exact=True
        ).count

        # 고유 소스 파일 수 (최대 500개 스캔)
        try:
            points, _ = client.scroll(
                collection_name=collection_name,
                scroll_filter=user_filter,
                limit=500,
                with_payload=["metadata"],
                with_vectors=False,
            )
            sources = set()
            for p in points:
                src = (p.payload or {}).get("metadata", {}).get("source")
                if src:
                    sources.add(src)
            file_count = len(sources)
        except Exception:
            file_count = 0

    # 그래프 노드/엣지 수 (KB별 격리)
    graph_node_count = 0
    graph_edge_count = 0
    if graph_service.graph:
        try:
            node_result = graph_service.query(
                "MATCH (n:__Entity__) WHERE n.kb_id = $kb_id AND n.user_id = $uid RETURN count(n) AS cnt",
                {"kb_id": kb_id, "uid": current_user.id}
            )
            if node_result:
                graph_node_count = node_result[0].get("cnt", 0)

            edge_result = graph_service.query(
                "MATCH (a:__Entity__)-[r]->(b:__Entity__) "
                "WHERE a.kb_id = $kb_id AND a.user_id = $uid RETURN count(r) AS cnt",
                {"kb_id": kb_id, "uid": current_user.id}
            )
            if edge_result:
                graph_edge_count = edge_result[0].get("cnt", 0)
        except Exception:
            pass

    return {
        "kb_id": kb_id,
        "chunk_count": chunk_count,
        "file_count": file_count,
        "graph_node_count": graph_node_count,
        "graph_edge_count": graph_edge_count,
    }


# ============================================================
# 그래프 조회 (기존 + edge id 추가)
# ============================================================

@router.get("/graph")
async def get_graph_data(
    kb_id: str = Query("default_kb"),
    current_user: User = Depends(get_current_user),
):
    """지식 베이스의 그래프 데이터를 조회합니다."""
    graph_service = get_graph_store_service()

    if not graph_service.graph:
        return {"nodes": [], "edges": [], "message": "Neo4j에 연결되어 있지 않습니다."}

    nodes_result = graph_service.query(
        """
        MATCH (n:__Entity__)
        WHERE n.kb_id = $kb_id AND n.user_id = $uid
        RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props
        LIMIT 200
        """,
        {"kb_id": kb_id, "uid": current_user.id}
    )

    edges_result = graph_service.query(
        """
        MATCH (a:__Entity__)-[r]->(b:__Entity__)
        WHERE a.kb_id = $kb_id AND a.user_id = $uid
        RETURN elementId(a) AS source, elementId(b) AS target,
               type(r) AS type, properties(r) AS props, elementId(r) AS id
        LIMIT 500
        """,
        {"kb_id": kb_id, "uid": current_user.id}
    )

    nodes = []
    for row in nodes_result:
        labels = row.get("labels", [])
        props = row.get("props", {})
        display_labels = [l for l in labels if not l.startswith("__")]
        nodes.append({
            "id": str(row["id"]),
            "label": display_labels[0] if display_labels else "Unknown",
            "name": props.get("name", props.get("id", "?")),
            "properties": {k: str(v) for k, v in props.items()}
        })

    edges = []
    for row in edges_result:
        edges.append({
            "id": str(row.get("id", "")),
            "source": str(row["source"]),
            "target": str(row["target"]),
            "type": row.get("type", "RELATED")
        })

    return {"nodes": nodes, "edges": edges}


# ============================================================
# 그래프 노드 CRUD
# ============================================================

@router.post("/graph/nodes")
async def create_graph_node(
    node: NodeCreate,
    kb_id: str = Query("default_kb"),
    current_user: User = Depends(get_current_user),
):
    """그래프에 노드를 추가합니다."""
    graph_service = get_graph_store_service()
    if not graph_service.graph:
        raise HTTPException(status_code=503, detail="Neo4j에 연결되어 있지 않습니다.")

    # label은 Pydantic validator에서 allowlist 검증됨
    query = f"""
    CREATE (n:`{node.label}` {{name: $name, kb_id: $kb_id, user_id: $uid}})
    SET n += $properties
    SET n:__Entity__
    RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props
    """
    result = graph_service.query(query, params={
        "name": node.name,
        "properties": node.properties,
        "kb_id": kb_id,
        "uid": current_user.id,
    })

    if not result:
        raise HTTPException(status_code=500, detail="노드 생성에 실패했습니다.")

    row = result[0]
    labels = [l for l in row.get("labels", []) if not l.startswith("__")]
    return {
        "id": str(row["id"]),
        "label": labels[0] if labels else node.label,
        "name": node.name,
        "properties": row.get("props", {}),
    }


@router.put("/graph/nodes/{node_id:path}")
async def update_graph_node(
    node_id: str,
    node: NodeUpdate,
    current_user: User = Depends(get_current_user),
):
    """그래프 노드를 수정합니다."""
    graph_service = get_graph_store_service()
    if not graph_service.graph:
        raise HTTPException(status_code=503, detail="Neo4j에 연결되어 있지 않습니다.")

    set_clauses = []
    params = {"node_id": node_id}

    if node.name is not None:
        set_clauses.append("n.name = $name")
        params["name"] = node.name
    if node.properties is not None:
        set_clauses.append("n += $properties")
        params["properties"] = node.properties

    if not set_clauses:
        raise HTTPException(status_code=400, detail="수정할 내용이 없습니다.")

    params["uid"] = current_user.id
    query = f"""
    MATCH (n) WHERE elementId(n) = $node_id AND n.user_id = $uid
    SET {', '.join(set_clauses)}
    RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS props
    """
    result = graph_service.query(query, params=params)

    if not result:
        raise HTTPException(status_code=404, detail="노드를 찾을 수 없습니다.")

    row = result[0]
    labels = [l for l in row.get("labels", []) if not l.startswith("__")]
    return {
        "id": str(row["id"]),
        "label": labels[0] if labels else "Unknown",
        "name": row.get("props", {}).get("name", "?"),
        "properties": row.get("props", {}),
    }


@router.delete("/graph/nodes/{node_id:path}")
async def delete_graph_node(
    node_id: str,
    current_user: User = Depends(get_current_user),
):
    """그래프 노드와 연결된 관계를 삭제합니다."""
    graph_service = get_graph_store_service()
    if not graph_service.graph:
        raise HTTPException(status_code=503, detail="Neo4j에 연결되어 있지 않습니다.")

    result = graph_service.query(
        "MATCH (n) WHERE elementId(n) = $node_id AND n.user_id = $uid DETACH DELETE n RETURN count(*) AS cnt",
        params={"node_id": node_id, "uid": current_user.id}
    )

    if not result or result[0].get("cnt", 0) == 0:
        raise HTTPException(status_code=404, detail="노드를 찾을 수 없습니다.")

    return {"message": "노드가 삭제되었습니다."}


# ============================================================
# 그래프 엣지 CRUD
# ============================================================

@router.post("/graph/edges")
async def create_graph_edge(
    edge: EdgeCreate,
    kb_id: str = Query("default_kb"),
    current_user: User = Depends(get_current_user),
):
    """그래프에 관계(엣지)를 추가합니다."""
    graph_service = get_graph_store_service()
    if not graph_service.graph:
        raise HTTPException(status_code=503, detail="Neo4j에 연결되어 있지 않습니다.")

    # relationship_type은 Pydantic validator에서 allowlist 검증됨
    # 소스/타겟 노드가 현재 사용자 + KB에 속하는지 확인
    query = f"""
    MATCH (a) WHERE elementId(a) = $source_id AND a.user_id = $uid
    MATCH (b) WHERE elementId(b) = $target_id AND b.user_id = $uid
    CREATE (a)-[r:`{edge.relationship_type}`]->(b)
    RETURN elementId(r) AS id, elementId(a) AS source, elementId(b) AS target, type(r) AS type
    """
    result = graph_service.query(query, params={
        "source_id": edge.source_id,
        "target_id": edge.target_id,
        "uid": current_user.id,
    })

    if not result:
        raise HTTPException(status_code=404, detail="소스 또는 타겟 노드를 찾을 수 없습니다.")

    row = result[0]
    return {
        "id": str(row["id"]),
        "source": str(row["source"]),
        "target": str(row["target"]),
        "type": row["type"],
    }


@router.delete("/graph/edges/{edge_id:path}")
async def delete_graph_edge(
    edge_id: str,
    current_user: User = Depends(get_current_user),
):
    """그래프 관계(엣지)를 삭제합니다."""
    graph_service = get_graph_store_service()
    if not graph_service.graph:
        raise HTTPException(status_code=503, detail="Neo4j에 연결되어 있지 않습니다.")

    result = graph_service.query(
        "MATCH (a)-[r]->(b) WHERE elementId(r) = $edge_id AND a.user_id = $uid "
        "DELETE r RETURN count(*) AS cnt",
        params={"edge_id": edge_id, "uid": current_user.id}
    )

    if not result or result[0].get("cnt", 0) == 0:
        raise HTTPException(status_code=404, detail="관계를 찾을 수 없습니다.")

    return {"message": "관계가 삭제되었습니다."}


# ============================================================
# 멀티모달 검색 (이미지로 검색)
# ============================================================

@router.post("/{kb_id}/search-by-image")
async def search_by_image(
    kb_id: str,
    image: UploadFile = File(...),
    content_type_filter: Optional[str] = Query(None, description="text | image | None (둘 다)"),
    top_k: int = Query(5, ge=1, le=20, description="반환할 문서 수"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    이미지를 업로드하여 CLIP 기반 멀티모달 검색을 수행합니다.

    Args:
        kb_id: 지식 베이스 ID
        image: 검색할 이미지 파일
        content_type_filter: "text" (텍스트만), "image" (이미지만), None (둘 다)
        top_k: 반환할 결과 수

    Returns:
        검색된 문서 리스트 (텍스트 청크 또는 이미지)
    """
    import tempfile
    from pathlib import Path
    from app.services.clip_embeddings import get_clip_embeddings
    from app.services.vdb.qdrant_store import QdrantStore

    # 이미지 파일 검증
    ext = Path(image.filename or "").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
        raise HTTPException(400, f"지원하지 않는 이미지 형식입니다: {ext}")

    # Qdrant 클라이언트 resolve
    ext_client = await resolve_qdrant_client(db, current_user.id, kb_id)
    vector_service = get_vector_store_service()
    client = vector_service.get_client(ext_client)
    collection_name = f"kb_{kb_id}"

    if not client.collection_exists(collection_name):
        raise HTTPException(404, "지식 베이스가 존재하지 않습니다.")

    # 임시 파일로 저장
    temp_file = None
    try:
        # 이미지 임시 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await image.read()
            tmp.write(content)
            temp_file = tmp.name

        # CLIP 이미지 임베딩 생성
        clip = get_clip_embeddings()
        query_vector = clip.embed_image(temp_file)

        # QdrantStore를 통해 멀티모달 검색
        store = QdrantStore(
            client=client,
            collection_name=collection_name,
            embeddings=vector_service.embeddings,
            embedding_dimension=settings.EMBEDDING_DIMENSION,
            user_id=current_user.id,
        )

        import asyncio
        results = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: asyncio.run(store.multimodal_search(
                query_vector=query_vector,
                content_type_filter=content_type_filter,
                top_k=top_k
            ))
        )

        # 결과 포맷팅
        formatted_results = []
        for doc in results:
            metadata = doc.metadata
            formatted_results.append({
                "content": doc.page_content,
                "metadata": metadata,
                "content_type": metadata.get("content_type", "text"),
                "source": metadata.get("source", "unknown"),
                "image_path": metadata.get("image_path") if metadata.get("content_type") == "image" else None,
                "image_dimensions": metadata.get("image_dimensions") if metadata.get("content_type") == "image" else None,
            })

        return {
            "kb_id": kb_id,
            "query_type": "image",
            "content_type_filter": content_type_filter,
            "results": formatted_results,
            "total": len(formatted_results),
        }

    except Exception as e:
        logger.error(f"Image search failed: {e}", exc_info=True)
        raise HTTPException(500, f"이미지 검색 실패: {str(e)}")

    finally:
        # 임시 파일 삭제
        if temp_file and Path(temp_file).exists():
            Path(temp_file).unlink()
