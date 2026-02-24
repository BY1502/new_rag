from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    # LLM 설정
    llm_model = Column(String(100), default="gemma3:12b")
    embedding_model = Column(String(100), default="bge-m3")
    vlm_model = Column(String(100), default="llava:7b")
    enable_multimodal = Column(Boolean, default=True)

    # RAG 설정
    retrieval_mode = Column(String(20), default="hybrid")
    search_top_k = Column(Integer, default=5)
    use_rerank = Column(Boolean, default=True)
    search_mode = Column(String(20), default="hybrid")  # dense, sparse, hybrid
    dense_weight = Column(Float, default=0.5)  # 하이브리드 검색 시 dense 비율 (0.0~1.0)
    use_multimodal_search = Column(Boolean, default=False)  # CLIP 멀티모달 검색
    system_prompt = Column(Text, nullable=True)

    # UI 설정
    theme = Column(String(20), default="Light")

    # 검색 설정
    active_search_provider_id = Column(String(50), default="ddg")

    # 스토리지 설정
    storage_type = Column(String(20), default="minio")
    bucket_name = Column(String(100), default="rag-ai-bucket")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="settings")
