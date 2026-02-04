from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import deps
from app.services.ingestion import IngestionService
from app.models.user import User

router = APIRouter()
ingestion_service = IngestionService()

# ✅ 수정됨: URL 경로에서 {kb_id} 제거 -> /upload 로 변경
# 프론트엔드가 /knowledge/upload 로 호출하므로 이를 맞춰줌
@router.post("/upload")
async def upload_file(
    # kb_id를 URL이 아닌 Form Data로 받음 (없으면 기본값 "default_kb")
    kb_id: str = Form("default_kb"), 
    file: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    print(f"📂 Uploading file: {file.filename} to KB: {kb_id} by User: {current_user.email}")
    
    success, message = await ingestion_service.process_file(
        file=file, 
        kb_id=kb_id,
        user_id=current_user.id 
    )
    
    if not success:
        raise HTTPException(status_code=500, detail=message)
        
    return {"message": message}

# ✅ 수정됨: 파일 목록 조회도 경로를 맞춰줌 (/files)
@router.get("/files")
async def list_files(
    kb_id: str = "default_kb", # Query Parameter로 받음 (?kb_id=...)
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # TODO: 추후 DB나 Vector Store에서 실제 파일 목록 조회 로직 구현 필요
    # 현재는 에러 방지용 빈 리스트 반환
    return {"files": []}