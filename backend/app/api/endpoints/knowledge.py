# backend/app/api/endpoints/knowledge.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, BackgroundTasks # ✅ 추가

@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks, # ✅ BackgroundTasks 주입
    kb_id: str = Form("default_kb"), 
    file: UploadFile = File(...),
    # ... (나머지 의존성)
):
    # 1. 파일을 일단 디스크에 저장 (빠름)
    file_path = await ingestion_service.process_file(file, kb_id, current_user.id)
    
    # 2. 무거운 처리 작업은 백그라운드로 넘김 (즉시 응답 리턴)
    background_tasks.add_task(
        ingestion_service.process_file_background, 
        file_path, file.filename, kb_id, current_user.id
    )
    
    return {"message": "업로드가 시작되었습니다. (백그라운드 처리 중)"}