from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.api import api_router
from app.db.session import engine
from app.db.base import Base

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

# 서버 시작 시 DB 테이블 자동 생성 (개발 편의용)
@app.on_event("startup")
async def init_tables():
    async with engine.begin() as conn:
        # 주의: 운영 환경에서는 Alembic 사용 권장
        await conn.run_sync(Base.metadata.create_all)

@app.get("/")
def read_root():
    return {"message": "Welcome to RAG AI API Server (Auth Secured) 🔒"}