from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest
from app.services.rag_service import RAGService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

def get_rag_service():
    return RAGService()

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    service: RAGService = Depends(get_rag_service)
):
    return StreamingResponse(
        service.generate_response(
            message=request.message,
            kb_id=request.kb_id,
            user_id=current_user.id,
            use_web_search=request.use_web_search,
            use_deep_think=request.use_deep_think, # ✅ 전달
            active_mcp_ids=request.active_mcp_ids
        ),
        media_type="text/event-stream"
    )