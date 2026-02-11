"""
대화 피드백 스키마
"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class FeedbackCreate(BaseModel):
    """피드백 생성 요청"""
    session_id: str = Field(..., description="채팅 세션 ID")
    message_index: int = Field(..., ge=0, description="메시지 순서 (0부터 시작)")
    user_message: str = Field(..., min_length=1, description="사용자 질문")
    ai_message: str = Field(..., min_length=1, description="AI 응답")

    # 평가 데이터 (최소 하나는 필수)
    rating: Optional[int] = Field(None, ge=1, le=5, description="별점 (1-5)")
    is_positive: Optional[bool] = Field(None, description="긍정/부정 (True=👍, False=👎)")
    feedback_text: Optional[str] = Field(None, description="자유 텍스트 피드백")

    # 컨텍스트 메타데이터
    agent_id: Optional[str] = None
    model_name: Optional[str] = None
    kb_ids: Optional[str] = None  # JSON string
    used_web_search: bool = False
    used_deep_think: bool = False

    # 품질 지표
    response_time_ms: Optional[int] = None
    tokens_used: Optional[int] = None


class FeedbackUpdate(BaseModel):
    """피드백 수정 요청"""
    rating: Optional[int] = Field(None, ge=1, le=5)
    is_positive: Optional[bool] = None
    feedback_text: Optional[str] = None
    is_verified: Optional[bool] = None
    is_included_in_training: Optional[bool] = None


class FeedbackResponse(BaseModel):
    """피드백 응답"""
    id: int
    user_id: int
    session_id: str
    message_index: int
    user_message: str
    ai_message: str

    rating: Optional[int] = None
    is_positive: Optional[bool] = None
    feedback_text: Optional[str] = None

    agent_id: Optional[str] = None
    model_name: Optional[str] = None
    kb_ids: Optional[str] = None
    used_web_search: bool
    used_deep_think: bool

    response_time_ms: Optional[int] = None
    tokens_used: Optional[int] = None

    is_verified: bool
    is_included_in_training: bool
    dataset_id: Optional[int] = None

    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FeedbackListResponse(BaseModel):
    """피드백 목록 응답"""
    feedbacks: List[FeedbackResponse]
    total: int
    has_positive: int
    has_rating: int
    avg_rating: Optional[float] = None


class TrainingDatasetCreate(BaseModel):
    """학습 데이터셋 생성 요청"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    format_type: str = Field(default="chat", pattern="^(chat|completion|instruction)$")
    min_rating: int = Field(default=3, ge=1, le=5)
    only_positive: bool = True


class TrainingDatasetResponse(BaseModel):
    """학습 데이터셋 응답"""
    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    format_type: str
    min_rating: int
    only_positive: bool
    total_examples: int
    verified_examples: int
    is_exported: bool
    export_path: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DatasetListResponse(BaseModel):
    """데이터셋 목록 응답"""
    datasets: List[TrainingDatasetResponse]
    total: int
