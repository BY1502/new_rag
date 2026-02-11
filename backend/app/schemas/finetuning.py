"""
파인튜닝 작업 스키마
"""
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class FineTuningJobCreate(BaseModel):
    """파인튜닝 작업 생성 요청"""
    dataset_id: int = Field(..., description="학습할 데이터셋 ID")
    job_name: str = Field(..., min_length=1, max_length=200, description="작업 이름")
    base_model: str = Field(..., description="기본 모델 (예: llama3.1, gpt-3.5-turbo)")
    provider: str = Field(default="ollama", pattern="^(ollama|openai)$")
    format_type: str = Field(default="chat", pattern="^(chat|completion|instruction)$")

    # 하이퍼파라미터
    learning_rate: float = Field(default=2e-5, gt=0, le=1e-3)
    num_epochs: int = Field(default=3, ge=1, le=20)
    batch_size: int = Field(default=4, ge=1, le=32)
    temperature: float = Field(default=0.7, ge=0, le=2)


class FineTuningJobResponse(BaseModel):
    """파인튜닝 작업 응답"""
    id: int
    user_id: int
    dataset_id: int
    job_id: str
    job_name: str
    base_model: str
    provider: str
    format_type: str
    status: str
    progress: int
    error_message: Optional[str] = None
    output_model_name: Optional[str] = None
    final_loss: Optional[float] = None
    training_time_seconds: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FineTuningJobListResponse(BaseModel):
    """파인튜닝 작업 목록 응답"""
    jobs: list[FineTuningJobResponse]
    total: int
