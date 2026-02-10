from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.chat import ChatRequest
from app.services.rag_service import get_rag_service
from app.api.deps import get_current_user
from app.models.user import User
from app.db.session import get_db

router = APIRouter()


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    스트리밍 채팅 엔드포인트
    """
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
            use_sql=request.use_sql,
            db_connection_id=request.db_connection_id,
            db=db
        ),
        media_type="text/event-stream"
    )
