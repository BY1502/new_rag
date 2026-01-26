from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import deps
from app.services.ingestion import IngestionService
from app.models.user import User

router = APIRouter()
ingestion_service = IngestionService()

@router.post("/{kb_id}/upload")
async def upload_file(
    kb_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user) # 유저 정보 주입
):
    # [핵심] user_id를 IngestionService에 전달
    success, message = await ingestion_service.process_file(
        file=file, 
        kb_id=kb_id,
        user_id=current_user.id 
    )
    
    if not success:
        raise HTTPException(status_code=500, detail=message)
        
    return {"message": message}

@router.get("/{kb_id}/files")
async def list_files(
    kb_id: str,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user)
):
    # 임시: Qdrant에 직접 쿼리해서 해당 유저의 파일 목록만 가져오는 기능은
    # Qdrant의 Scroll API를 써야 함. 여기서는 빈 리스트 반환 (DB 구축 후 연결 권장)
    return {"files": []}