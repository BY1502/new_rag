"""
대화 피드백 모델 - 파인튜닝을 위한 학습 데이터 수집
"""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Float
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class ConversationFeedback(Base):
    """대화 피드백 - AI 응답에 대한 사용자 평가"""
    __tablename__ = "conversation_feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String(100), nullable=False, index=True)

    # 메시지 식별
    message_index = Column(Integer, nullable=False)  # 세션 내 메시지 순서
    user_message = Column(Text, nullable=False)  # 사용자 질문 (prompt)
    ai_message = Column(Text, nullable=False)  # AI 응답 (completion)

    # 평가 데이터
    rating = Column(Integer, nullable=True)  # 1-5 별점 (optional)
    is_positive = Column(Boolean, nullable=True)  # 👍/👎 (optional)
    feedback_text = Column(Text, nullable=True)  # 자유 텍스트 피드백

    # 컨텍스트 메타데이터
    agent_id = Column(String(100), nullable=True)  # 사용한 에이전트
    model_name = Column(String(100), nullable=True)  # 사용한 모델
    kb_ids = Column(Text, nullable=True)  # JSON array of KB IDs
    used_web_search = Column(Boolean, default=False)
    used_deep_think = Column(Boolean, default=False)

    # 품질 지표
    response_time_ms = Column(Integer, nullable=True)  # 응답 시간 (밀리초)
    tokens_used = Column(Integer, nullable=True)  # 토큰 사용량 (추정치)

    # 학습 데이터 관리
    is_verified = Column(Boolean, default=False)  # 품질 검증 완료 여부
    is_included_in_training = Column(Boolean, default=False)  # 학습 데이터셋 포함 여부
    dataset_id = Column(Integer, ForeignKey("training_datasets.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="conversation_feedbacks")
    dataset = relationship("TrainingDataset", back_populates="feedbacks")


class TrainingDataset(Base):
    """학습 데이터셋 - 파인튜닝용 데이터 모음"""
    __tablename__ = "training_datasets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # 데이터셋 설정
    format_type = Column(String(50), default="chat")  # chat | completion | instruction
    min_rating = Column(Integer, default=3)  # 최소 별점 (필터링용)
    only_positive = Column(Boolean, default=True)  # 👍만 포함

    # 통계
    total_examples = Column(Integer, default=0)
    verified_examples = Column(Integer, default=0)

    # 상태
    is_exported = Column(Boolean, default=False)
    export_path = Column(String(500), nullable=True)  # JSONL 파일 경로

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="training_datasets")
    feedbacks = relationship("ConversationFeedback", back_populates="dataset")


class FineTuningJob(Base):
    """파인튜닝 작업 - Ollama/OpenAI 학습 작업 관리"""
    __tablename__ = "finetuning_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    dataset_id = Column(Integer, ForeignKey("training_datasets.id", ondelete="CASCADE"), nullable=False)

    job_id = Column(String(100), unique=True, nullable=False, index=True)
    job_name = Column(String(200), nullable=False)

    # 작업 설정
    base_model = Column(String(100), nullable=False)  # llama3.1, gpt-3.5-turbo 등
    provider = Column(String(50), default="ollama")  # ollama | openai
    format_type = Column(String(50), default="chat")  # chat | completion | instruction

    # Ollama 전용 설정
    modelfile_path = Column(String(500), nullable=True)
    adapter_path = Column(String(500), nullable=True)  # LoRA adapter 경로

    # 하이퍼파라미터
    learning_rate = Column(Float, default=2e-5)
    num_epochs = Column(Integer, default=3)
    batch_size = Column(Integer, default=4)
    temperature = Column(Float, default=0.7)

    # 상태
    status = Column(String(50), default="pending")  # pending | running | completed | failed | cancelled
    progress = Column(Integer, default=0)  # 0-100
    error_message = Column(Text, nullable=True)

    # 결과
    output_model_name = Column(String(200), nullable=True)  # 생성된 모델 이름
    final_loss = Column(Float, nullable=True)
    training_time_seconds = Column(Integer, nullable=True)

    # 메타데이터
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="finetuning_jobs")
    dataset = relationship("TrainingDataset")
