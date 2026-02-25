"""
파인튜닝 작업 API 엔드포인트
- Ollama (few-shot Modelfile)
- Unsloth (QLoRA 실제 가중치 학습)
"""
import logging
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.finetuning import (
    FineTuningJobCreate,
    FineTuningJobResponse,
    FineTuningJobListResponse,
)
from app.models.conversation_feedback import FineTuningJob, TrainingDataset, ConversationFeedback
from app.models.user import User
from app.api.deps import get_current_user
from app.db.session import get_db
from app.services.finetuning_service import FineTuningService

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================
# 백그라운드 태스크
# ============================================================

async def run_finetuning_job(
    job_id: str,
    dataset_id: int,
    base_model: str,
    output_model_name: str,
    temperature: float,
    db_url: str,
):
    """백그라운드에서 Ollama Modelfile 파인튜닝 실행"""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as AS
    from sqlalchemy.orm import sessionmaker

    engine = create_async_engine(db_url)
    async_session = sessionmaker(engine, class_=AS, expire_on_commit=False)

    async with async_session() as db:
        try:
            stmt = select(FineTuningJob).where(FineTuningJob.job_id == job_id)
            result = await db.execute(stmt)
            job = result.scalar_one_or_none()

            if not job:
                logger.error(f"Job {job_id} not found")
                return

            job.status = "running"
            job.started_at = datetime.utcnow()
            job.progress = 10
            await db.commit()

            ds_stmt = select(TrainingDataset).where(TrainingDataset.id == dataset_id)
            ds_result = await db.execute(ds_stmt)
            dataset = ds_result.scalar_one_or_none()

            if not dataset or not dataset.export_path:
                job.status = "failed"
                job.error_message = "데이터셋 파일을 찾을 수 없습니다. 먼저 내보내기를 실행하세요."
                await db.commit()
                return

            job.progress = 30
            await db.commit()

            ft_service = FineTuningService()
            modelfile_content = ft_service.generate_modelfile(
                base_model=base_model,
                dataset_path=dataset.export_path,
                output_name=output_model_name,
                temperature=temperature,
            )

            modelfile_path = ft_service.save_modelfile(modelfile_content, job_id)
            job.modelfile_path = modelfile_path
            job.progress = 50
            await db.commit()

            success, message = await ft_service.create_ollama_model(
                modelfile_path=modelfile_path,
                output_model_name=output_model_name,
            )

            if success:
                job.status = "completed"
                job.output_model_name = output_model_name
                job.progress = 100
                job.completed_at = datetime.utcnow()
                if job.started_at:
                    delta = job.completed_at - job.started_at
                    job.training_time_seconds = int(delta.total_seconds())
                logger.info(f"Fine-tuning job {job_id} completed: {output_model_name}")
            else:
                job.status = "failed"
                job.error_message = message
                logger.error(f"Fine-tuning job {job_id} failed: {message}")

            await db.commit()

        except Exception as e:
            logger.exception(f"Fine-tuning job {job_id} error: {e}")
            job.status = "failed"
            job.error_message = str(e)
            await db.commit()

    await engine.dispose()


async def run_qlora_finetuning_job(
    job_id: str,
    dataset_id: int,
    base_model: str,
    output_model_name: str,
    num_epochs: int,
    learning_rate: float,
    batch_size: int,
    db_url: str,
):
    """백그라운드에서 QLoRA 파인튜닝 실행"""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as AS
    from sqlalchemy.orm import sessionmaker
    from app.services.qlora_training import run_qlora_training

    engine = create_async_engine(db_url)
    async_session = sessionmaker(engine, class_=AS, expire_on_commit=False)

    async with async_session() as db:
        try:
            stmt = select(FineTuningJob).where(FineTuningJob.job_id == job_id)
            result = await db.execute(stmt)
            job = result.scalar_one_or_none()

            if not job:
                logger.error(f"QLoRA Job {job_id} not found")
                return

            job.status = "running"
            job.started_at = datetime.utcnow()
            job.progress = 10
            await db.commit()

            # 데이터셋 확인
            ds_stmt = select(TrainingDataset).where(TrainingDataset.id == dataset_id)
            ds_result = await db.execute(ds_stmt)
            dataset = ds_result.scalar_one_or_none()

            if not dataset or not dataset.export_path:
                job.status = "failed"
                job.error_message = "데이터셋 파일을 찾을 수 없습니다. 먼저 내보내기를 실행하세요."
                await db.commit()
                return

            job.progress = 20
            await db.commit()

            # QLoRA 학습 실행
            result = await run_qlora_training(
                dataset_path=dataset.export_path,
                base_model=base_model,
                output_name=output_model_name,
                num_epochs=num_epochs,
                learning_rate=learning_rate,
                batch_size=batch_size,
            )

            if result["success"]:
                job.status = "completed"
                job.output_model_name = output_model_name
                job.progress = 100
                job.completed_at = datetime.utcnow()
                job.adapter_path = result.get("adapter_path")
                metrics = result.get("metrics", {})
                job.final_loss = metrics.get("train_loss")
                if job.started_at:
                    delta = job.completed_at - job.started_at
                    job.training_time_seconds = int(delta.total_seconds())
                logger.info(f"QLoRA job {job_id} completed: {output_model_name}")
            else:
                job.status = "failed"
                job.error_message = result.get("message", "Unknown error")
                logger.error(f"QLoRA job {job_id} failed: {result.get('message')}")

            await db.commit()

        except Exception as e:
            logger.exception(f"QLoRA job {job_id} error: {e}")
            stmt = select(FineTuningJob).where(FineTuningJob.job_id == job_id)
            result = await db.execute(stmt)
            job = result.scalar_one_or_none()
            if job:
                job.status = "failed"
                job.error_message = str(e)
                await db.commit()

    await engine.dispose()


# ============================================================
# 파인튜닝 작업 엔드포인트
# ============================================================

@router.post("/jobs", response_model=FineTuningJobResponse)
async def create_finetuning_job(
    job_data: FineTuningJobCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """파인튜닝 작업 생성 및 시작"""
    ds_stmt = select(TrainingDataset).where(
        TrainingDataset.id == job_data.dataset_id,
        TrainingDataset.user_id == current_user.id,
    )
    ds_result = await db.execute(ds_stmt)
    dataset = ds_result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(404, "데이터셋을 찾을 수 없습니다")

    if dataset.total_examples == 0:
        raise HTTPException(400, "데이터셋이 비어있습니다. 먼저 빌드를 실행하세요.")

    job_id = f"ft-{uuid.uuid4().hex[:12]}"
    output_model_name = f"{current_user.email.split('@')[0]}_{job_data.job_name}_{job_id[:8]}"

    new_job = FineTuningJob(
        user_id=current_user.id,
        dataset_id=job_data.dataset_id,
        job_id=job_id,
        job_name=job_data.job_name,
        base_model=job_data.base_model,
        provider=job_data.provider,
        format_type=job_data.format_type,
        learning_rate=job_data.learning_rate,
        num_epochs=job_data.num_epochs,
        batch_size=job_data.batch_size,
        temperature=job_data.temperature,
        status="pending",
    )

    db.add(new_job)
    await db.commit()
    await db.refresh(new_job)

    from app.core.config import settings

    if job_data.provider == "ollama":
        background_tasks.add_task(
            run_finetuning_job,
            job_id=job_id,
            dataset_id=job_data.dataset_id,
            base_model=job_data.base_model,
            output_model_name=output_model_name,
            temperature=job_data.temperature,
            db_url=str(settings.DATABASE_URL),
        )
    elif job_data.provider == "unsloth":
        background_tasks.add_task(
            run_qlora_finetuning_job,
            job_id=job_id,
            dataset_id=job_data.dataset_id,
            base_model=job_data.base_model,
            output_model_name=output_model_name,
            num_epochs=job_data.num_epochs,
            learning_rate=job_data.learning_rate,
            batch_size=job_data.batch_size,
            db_url=str(settings.DATABASE_URL),
        )
    else:
        new_job.status = "failed"
        new_job.error_message = "지원하지 않는 프로바이더입니다"
        await db.commit()

    logger.info(f"Fine-tuning job created: {job_id} (provider={job_data.provider})")
    return new_job


@router.get("/jobs", response_model=FineTuningJobListResponse)
async def list_finetuning_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """파인튜닝 작업 목록 조회"""
    stmt = (
        select(FineTuningJob)
        .where(FineTuningJob.user_id == current_user.id)
        .order_by(FineTuningJob.created_at.desc())
    )
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    return {"jobs": jobs, "total": len(jobs)}


@router.get("/jobs/{job_id}", response_model=FineTuningJobResponse)
async def get_finetuning_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """개별 파인튜닝 작업 조회"""
    stmt = select(FineTuningJob).where(
        FineTuningJob.job_id == job_id,
        FineTuningJob.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "작업을 찾을 수 없습니다")
    return job


@router.delete("/jobs/{job_id}")
async def cancel_finetuning_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """파인튜닝 작업 취소/삭제"""
    stmt = select(FineTuningJob).where(
        FineTuningJob.job_id == job_id,
        FineTuningJob.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "작업을 찾을 수 없습니다")

    if job.status == "running":
        job.status = "cancelled"
        await db.commit()
        return {"message": "작업이 취소되었습니다"}

    await db.delete(job)
    await db.commit()
    return {"message": "작업이 삭제되었습니다"}


@router.get("/models")
async def list_custom_models(
    current_user: User = Depends(get_current_user),
):
    """사용자 커스텀 모델 목록 (Ollama)"""
    ft_service = FineTuningService()
    all_models = await ft_service.list_ollama_models()
    user_prefix = current_user.email.split('@')[0]
    custom_models = [m for m in all_models if user_prefix in m]
    return {"models": custom_models, "total": len(custom_models)}


class SetDefaultModelRequest(BaseModel):
    model_name: str = Field(..., min_length=1, max_length=200, description="커스텀 모델 이름")


@router.post("/models/set-default")
async def set_default_model(
    req: SetDefaultModelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """파인튜닝 모델을 사용자 기본 모델로 설정"""
    from app.crud.user_settings import get_or_create_settings
    user_settings = await get_or_create_settings(db, current_user.id)
    user_settings.custom_model = req.model_name
    await db.commit()
    logger.info(f"User {current_user.id} set default model: {req.model_name}")
    return {"message": f"기본 모델이 {req.model_name}(으)로 설정되었습니다.", "model": req.model_name}


@router.post("/models/clear-default")
async def clear_default_model(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """커스텀 모델 설정 해제 (시스템 기본값으로 복원)"""
    from app.crud.user_settings import get_or_create_settings
    user_settings = await get_or_create_settings(db, current_user.id)
    user_settings.custom_model = None
    await db.commit()
    logger.info(f"User {current_user.id} cleared custom model")
    return {"message": "기본 모델이 시스템 기본값으로 복원되었습니다."}


# ============================================================
# 베이스 모델 관리 엔드포인트
# ============================================================

class ModelDownloadRequest(BaseModel):
    model_name: str = Field(default="Qwen/Qwen2.5-3B-Instruct", description="HuggingFace 모델명")


@router.post("/models/download")
async def download_base_model(
    req: ModelDownloadRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """베이스 모델 다운로드 (백그라운드)"""
    from app.services.model_manager import ModelManager

    if ModelManager.is_downloaded(req.model_name):
        return {"message": "이미 다운로드되어 있습니다", "status": "done"}

    background_tasks.add_task(ModelManager.download_model, req.model_name)
    return {"message": f"다운로드가 시작되었습니다: {req.model_name}", "status": "downloading"}


@router.get("/models/base")
async def list_base_models(
    current_user: User = Depends(get_current_user),
):
    """다운로드된 베이스 모델 목록"""
    from app.services.model_manager import ModelManager
    return {"models": ModelManager.list_downloaded()}


@router.get("/models/download-status")
async def get_download_status(
    model_name: str = Query(..., description="모델명"),
    current_user: User = Depends(get_current_user),
):
    """모델 다운로드 상태 조회"""
    from app.services.model_manager import ModelManager
    return ModelManager.get_status(model_name)
