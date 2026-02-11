"""
파인튜닝 작업 API 엔드포인트
"""
import logging
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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


async def run_finetuning_job(
    job_id: str,
    dataset_id: int,
    base_model: str,
    output_model_name: str,
    temperature: float,
    db_url: str,
):
    """백그라운드에서 파인튜닝 실행"""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as AS
    from sqlalchemy.orm import sessionmaker

    engine = create_async_engine(db_url)
    async_session = sessionmaker(engine, class_=AS, expire_on_commit=False)

    async with async_session() as db:
        try:
            # 작업 상태 업데이트: running
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

            # 데이터셋 조회
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

            # Modelfile 생성
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

            # Ollama 모델 생성
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


@router.post("/jobs", response_model=FineTuningJobResponse)
async def create_finetuning_job(
    job_data: FineTuningJobCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """파인튜닝 작업 생성 및 시작"""
    # 데이터셋 확인
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

    # Job ID 생성
    job_id = f"ft-{uuid.uuid4().hex[:12]}"
    output_model_name = f"{current_user.email.split('@')[0]}_{job_data.job_name}_{job_id[:8]}"

    # 작업 생성
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

    # 백그라운드에서 학습 실행 (Ollama만 지원)
    if job_data.provider == "ollama":
        from app.core.config import settings

        background_tasks.add_task(
            run_finetuning_job,
            job_id=job_id,
            dataset_id=job_data.dataset_id,
            base_model=job_data.base_model,
            output_model_name=output_model_name,
            temperature=job_data.temperature,
            db_url=str(settings.DATABASE_URL),
        )
    else:
        new_job.status = "failed"
        new_job.error_message = "OpenAI 파인튜닝은 아직 지원하지 않습니다"
        await db.commit()

    logger.info(f"Fine-tuning job created: {job_id} for dataset {job_data.dataset_id}")
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

    # 실행 중인 작업은 취소만
    if job.status == "running":
        job.status = "cancelled"
        await db.commit()
        return {"message": "작업이 취소되었습니다"}

    # 완료/실패한 작업은 삭제
    await db.delete(job)
    await db.commit()

    return {"message": "작업이 삭제되었습니다"}


@router.get("/models")
async def list_custom_models(
    current_user: User = Depends(get_current_user),
):
    """사용자 커스텀 모델 목록"""
    ft_service = FineTuningService()
    all_models = await ft_service.list_ollama_models()

    # 사용자 이메일 프리픽스로 필터링
    user_prefix = current_user.email.split('@')[0]
    custom_models = [m for m in all_models if user_prefix in m]

    return {"models": custom_models, "total": len(custom_models)}
