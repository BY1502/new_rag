from fastapi import APIRouter
from app.api.endpoints import auth, chat, knowledge, settings, agents, sessions, external_services, feedback, finetuning

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(external_services.router, prefix="/services", tags=["services"])
api_router.include_router(feedback.router, prefix="/training", tags=["training"])
api_router.include_router(finetuning.router, prefix="/finetuning", tags=["finetuning"])