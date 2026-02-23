"""
대화 피드백 API 엔드포인트
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.feedback import (
    FeedbackCreate, FeedbackUpdate, FeedbackResponse, FeedbackListResponse,
    TrainingDatasetCreate, TrainingDatasetResponse, DatasetListResponse
)
from app.models.conversation_feedback import ConversationFeedback, TrainingDataset
from app.models.user import User
from app.api.deps import get_current_user
from app.db.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
async def create_feedback(
    feedback: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """대화 피드백 생성"""
    # 최소 하나의 평가는 있어야 함
    if feedback.rating is None and feedback.is_positive is None and not feedback.feedback_text:
        raise HTTPException(400, "평가 데이터가 없습니다 (rating, is_positive, feedback_text 중 하나는 필수)")

    new_feedback = ConversationFeedback(
        user_id=current_user.id,
        session_id=feedback.session_id,
        message_index=feedback.message_index,
        user_message=feedback.user_message,
        ai_message=feedback.ai_message,
        rating=feedback.rating,
        is_positive=feedback.is_positive,
        feedback_text=feedback.feedback_text,
        agent_id=feedback.agent_id,
        model_name=feedback.model_name,
        kb_ids=feedback.kb_ids,
        used_web_search=feedback.used_web_search,
        used_deep_think=feedback.used_deep_think,
        response_time_ms=feedback.response_time_ms,
        tokens_used=feedback.tokens_used,
    )

    db.add(new_feedback)
    await db.commit()
    await db.refresh(new_feedback)

    logger.info(f"Feedback created: user={current_user.id}, session={feedback.session_id}, rating={feedback.rating}")
    return new_feedback


@router.get("/feedback", response_model=FeedbackListResponse)
async def list_feedbacks(
    session_id: Optional[str] = Query(None, description="특정 세션만 필터링"),
    min_rating: Optional[int] = Query(None, ge=1, le=5, description="최소 별점"),
    only_positive: Optional[bool] = Query(None, description="긍정 평가만"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """피드백 목록 조회"""
    # 기본 필터
    filters = [ConversationFeedback.user_id == current_user.id]

    if session_id:
        filters.append(ConversationFeedback.session_id == session_id)
    if min_rating:
        filters.append(ConversationFeedback.rating >= min_rating)
    if only_positive is True:
        filters.append(ConversationFeedback.is_positive == True)

    # 전체 개수
    count_stmt = select(func.count()).select_from(ConversationFeedback).where(and_(*filters))
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # 목록 조회
    stmt = (
        select(ConversationFeedback)
        .where(and_(*filters))
        .order_by(ConversationFeedback.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    feedbacks = result.scalars().all()

    # 통계
    stats_stmt = select(
        func.count(ConversationFeedback.id).label("total"),
        func.sum(func.cast(ConversationFeedback.is_positive == True, Integer)).label("positive"),
        func.count(ConversationFeedback.rating).label("has_rating"),
        func.avg(ConversationFeedback.rating).label("avg_rating"),
    ).where(ConversationFeedback.user_id == current_user.id)

    stats_result = await db.execute(stats_stmt)
    stats = stats_result.first()

    return {
        "feedbacks": feedbacks,
        "total": total,
        "has_positive": stats.positive or 0 if stats else 0,
        "has_rating": stats.has_rating or 0 if stats else 0,
        "avg_rating": float(stats.avg_rating) if stats and stats.avg_rating else None,
    }


@router.get("/feedback/{feedback_id}", response_model=FeedbackResponse)
async def get_feedback(
    feedback_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """개별 피드백 조회"""
    stmt = select(ConversationFeedback).where(
        ConversationFeedback.id == feedback_id,
        ConversationFeedback.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    feedback = result.scalar_one_or_none()

    if not feedback:
        raise HTTPException(404, "피드백을 찾을 수 없습니다")

    return feedback


@router.put("/feedback/{feedback_id}", response_model=FeedbackResponse)
async def update_feedback(
    feedback_id: int,
    update_data: FeedbackUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """피드백 수정"""
    stmt = select(ConversationFeedback).where(
        ConversationFeedback.id == feedback_id,
        ConversationFeedback.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    feedback = result.scalar_one_or_none()

    if not feedback:
        raise HTTPException(404, "피드백을 찾을 수 없습니다")

    # 업데이트
    if update_data.rating is not None:
        feedback.rating = update_data.rating
    if update_data.is_positive is not None:
        feedback.is_positive = update_data.is_positive
    if update_data.feedback_text is not None:
        feedback.feedback_text = update_data.feedback_text
    if update_data.is_verified is not None:
        feedback.is_verified = update_data.is_verified
    if update_data.is_included_in_training is not None:
        feedback.is_included_in_training = update_data.is_included_in_training

    await db.commit()
    await db.refresh(feedback)

    return feedback


@router.delete("/feedback/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """피드백 삭제"""
    stmt = select(ConversationFeedback).where(
        ConversationFeedback.id == feedback_id,
        ConversationFeedback.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    feedback = result.scalar_one_or_none()

    if not feedback:
        raise HTTPException(404, "피드백을 찾을 수 없습니다")

    await db.delete(feedback)
    await db.commit()

    return {"message": "피드백이 삭제되었습니다"}


# ============================================================
# 학습 데이터셋 엔드포인트
# ============================================================

@router.post("/datasets", response_model=TrainingDatasetResponse)
async def create_dataset(
    dataset: TrainingDatasetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학습 데이터셋 생성"""
    new_dataset = TrainingDataset(
        user_id=current_user.id,
        name=dataset.name,
        description=dataset.description,
        format_type=dataset.format_type,
        min_rating=dataset.min_rating,
        only_positive=dataset.only_positive,
    )

    db.add(new_dataset)
    await db.commit()
    await db.refresh(new_dataset)

    logger.info(f"Dataset created: user={current_user.id}, name={dataset.name}")
    return new_dataset


@router.get("/datasets", response_model=DatasetListResponse)
async def list_datasets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학습 데이터셋 목록 조회"""
    stmt = (
        select(TrainingDataset)
        .where(TrainingDataset.user_id == current_user.id)
        .order_by(TrainingDataset.created_at.desc())
    )
    result = await db.execute(stmt)
    datasets = result.scalars().all()

    return {
        "datasets": datasets,
        "total": len(datasets),
    }


@router.get("/datasets/{dataset_id}", response_model=TrainingDatasetResponse)
async def get_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """개별 데이터셋 조회"""
    stmt = select(TrainingDataset).where(
        TrainingDataset.id == dataset_id,
        TrainingDataset.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    dataset = result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(404, "데이터셋을 찾을 수 없습니다")

    return dataset


@router.post("/datasets/{dataset_id}/build")
async def build_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """데이터셋 빌드 - 피드백 필터링 및 포함"""
    stmt = select(TrainingDataset).where(
        TrainingDataset.id == dataset_id,
        TrainingDataset.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    dataset = result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(404, "데이터셋을 찾을 수 없습니다")

    # 피드백 필터링
    filters = [ConversationFeedback.user_id == current_user.id]

    if dataset.min_rating:
        filters.append(ConversationFeedback.rating >= dataset.min_rating)

    if dataset.only_positive:
        filters.append(ConversationFeedback.is_positive == True)

    # 피드백 조회
    fb_stmt = select(ConversationFeedback).where(and_(*filters))
    fb_result = await db.execute(fb_stmt)
    feedbacks = fb_result.scalars().all()

    # 데이터셋에 할당
    for fb in feedbacks:
        fb.dataset_id = dataset_id
        fb.is_included_in_training = True

    # 통계 업데이트
    dataset.total_examples = len(feedbacks)
    dataset.verified_examples = sum(1 for fb in feedbacks if fb.is_verified)

    await db.commit()
    await db.refresh(dataset)

    logger.info(f"Dataset {dataset_id} built: {len(feedbacks)} examples")
    return {"message": f"{len(feedbacks)}개 예제가 데이터셋에 추가되었습니다", "dataset": dataset}


@router.get("/datasets/{dataset_id}/export")
async def export_dataset(
    dataset_id: int,
    format: str = Query("chat", pattern="^(chat|completion|instruction)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """데이터셋 JSONL 내보내기"""
    import json
    import tempfile
    from pathlib import Path
    from fastapi.responses import FileResponse

    stmt = select(TrainingDataset).where(
        TrainingDataset.id == dataset_id,
        TrainingDataset.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    dataset = result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(404, "데이터셋을 찾을 수 없습니다")

    # 데이터셋에 포함된 피드백 조회
    fb_stmt = select(ConversationFeedback).where(
        ConversationFeedback.dataset_id == dataset_id,
        ConversationFeedback.is_included_in_training == True,
    )
    fb_result = await db.execute(fb_stmt)
    feedbacks = fb_result.scalars().all()

    if not feedbacks:
        raise HTTPException(400, "데이터셋이 비어있습니다. 먼저 빌드를 실행하세요.")

    # JSONL 생성
    temp_dir = Path(tempfile.gettempdir()) / "rag_ai_datasets"
    temp_dir.mkdir(exist_ok=True)

    export_file = temp_dir / f"dataset_{dataset_id}_{format}.jsonl"

    with open(export_file, "w", encoding="utf-8") as f:
        for fb in feedbacks:
            if format == "chat":
                # OpenAI chat format
                entry = {
                    "messages": [
                        {"role": "user", "content": fb.user_message},
                        {"role": "assistant", "content": fb.ai_message},
                    ]
                }
            elif format == "completion":
                # Simple completion format
                entry = {
                    "prompt": fb.user_message,
                    "completion": fb.ai_message,
                }
            else:  # instruction
                # Instruction-tuning format
                entry = {
                    "instruction": fb.user_message,
                    "response": fb.ai_message,
                    "input": "",
                }

            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # 경로 저장
    dataset.is_exported = True
    dataset.export_path = str(export_file)
    await db.commit()

    logger.info(f"Dataset {dataset_id} exported: {len(feedbacks)} examples to {export_file}")

    return FileResponse(
        path=export_file,
        filename=f"{dataset.name}_{format}.jsonl",
        media_type="application/x-ndjson",
    )


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """데이터셋 삭제"""
    stmt = select(TrainingDataset).where(
        TrainingDataset.id == dataset_id,
        TrainingDataset.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    dataset = result.scalar_one_or_none()

    if not dataset:
        raise HTTPException(404, "데이터셋을 찾을 수 없습니다")

    await db.delete(dataset)
    await db.commit()

    return {"message": "데이터셋이 삭제되었습니다"}
