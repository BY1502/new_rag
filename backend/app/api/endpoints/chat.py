import asyncio
import logging
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.chat import ChatRequest
from app.services.rag_service import get_rag_service
from app.services.ingestion import get_ingestion_service
from app.api.deps import get_current_user
from app.models.user import User
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

# 텍스트 추출 허용 확장자
_TEXT_EXTENSIONS = {".txt", ".md", ".csv"}
_BINARY_EXTENSIONS = {".pdf", ".docx", ".doc", ".pptx", ".xlsx"}
_ALLOWED_EXTENSIONS = _TEXT_EXTENSIONS | _BINARY_EXTENSIONS


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    스트리밍 채팅 엔드포인트
    """
    logger.info(
        f"[CHAT-REQ] model={request.model}, use_sql={request.use_sql}, "
        f"db_connection_id={request.db_connection_id}, user={current_user.id}"
    )

    service = get_rag_service()

    # 대화 히스토리를 dict 리스트로 변환
    history = [{"role": m.role, "content": m.content} for m in request.history]

    return StreamingResponse(
        service.generate_response(
            message=request.message,
            kb_ids=request.kb_ids,
            user_id=current_user.id,
            model=request.model,
            system_prompt=request.system_prompt,
            history=history,
            use_web_search=request.use_web_search,
            use_deep_think=request.use_deep_think,
            active_mcp_ids=request.active_mcp_ids,
            top_k=request.top_k,
            use_rerank=request.use_rerank,
            search_provider=request.search_provider,
            search_mode=request.search_mode,
            images=request.images,
            use_sql=request.use_sql,
            db_connection_id=request.db_connection_id,
            use_multimodal_search=request.use_multimodal_search,
            db=db
        ),
        media_type="text/event-stream"
    )


@router.post("/extract-text")
async def extract_text_from_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    첨부 파일에서 텍스트를 추출합니다 (채팅용, 청킹/임베딩 없음).
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"지원하지 않는 파일 형식입니다: {ext}")

    ingestion = get_ingestion_service()
    file_path, original_name = await ingestion.save_file(file, "temp_chat", current_user.id)
    file_path_obj = Path(file_path)

    try:
        text = ""

        # 텍스트 파일은 직접 읽기
        if ext in _TEXT_EXTENSIONS:
            try:
                async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                    text = await f.read()
            except UnicodeDecodeError:
                async with aiofiles.open(file_path, "r", encoding="cp949") as f:
                    text = await f.read()

        # 바이너리 파일은 Docling/PyPDF로 추출
        else:
            # Docling 시도
            if ingestion.converter:
                try:
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        None, ingestion.converter.convert, file_path
                    )
                    text = ingestion.clean_markdown(result.document.export_to_markdown())
                except Exception as e:
                    logger.warning(f"Docling extraction failed: {e}")

            # PyPDF 폴백
            if not text.strip() and ext == ".pdf":
                try:
                    from langchain_community.document_loaders import PyPDFLoader
                    loader = PyPDFLoader(file_path)
                    loop = asyncio.get_running_loop()
                    docs = await loop.run_in_executor(None, loader.load)
                    text = ingestion.clean_markdown(
                        "\n\n".join(d.page_content for d in docs)
                    )
                except Exception as e:
                    logger.warning(f"PyPDF extraction failed: {e}")

        if not text.strip():
            raise HTTPException(422, "파일에서 텍스트를 추출할 수 없습니다.")

        # 최대 길이 제한
        max_chars = 15000
        truncated = len(text) > max_chars
        if truncated:
            text = text[:max_chars] + "\n\n...(이하 생략)..."

        return {
            "filename": original_name,
            "text": text,
            "char_count": len(text),
            "truncated": truncated,
        }
    finally:
        await ingestion._cleanup_file(file_path_obj)
