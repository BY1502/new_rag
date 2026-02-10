"""
지식 베이스 + 파일 메타데이터 모델
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    __table_args__ = (
        UniqueConstraint("user_id", "kb_id", name="uq_user_kb"),
    )

    id = Column(Integer, primary_key=True, index=True)
    kb_id = Column(String(100), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    chunk_size = Column(Integer, default=512)
    chunk_overlap = Column(Integer, default=50)
    external_service_id = Column(String(100), nullable=True, default=None)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="knowledge_bases")
    files = relationship("KnowledgeFile", back_populates="knowledge_base", cascade="all, delete-orphan")


class KnowledgeFile(Base):
    __tablename__ = "knowledge_files"

    id = Column(Integer, primary_key=True, index=True)
    kb_pk = Column(Integer, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    status = Column(String(20), default="processing")  # processing | completed | error
    error_message = Column(Text, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    knowledge_base = relationship("KnowledgeBase", back_populates="files")
