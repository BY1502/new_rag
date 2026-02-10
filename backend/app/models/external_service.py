"""
외부 서비스 모델 (Qdrant/PostgreSQL 등)
"""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class ExternalService(Base):
    __tablename__ = "external_services"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    service_type = Column(String(30), nullable=False)  # qdrant | postgresql | pinecone
    url = Column(String(500), default="")
    api_key_encrypted = Column(Text, nullable=True)
    username = Column(String(255), default="")
    encrypted_password = Column(Text, nullable=True)
    database = Column(String(255), default="")
    port = Column(Integer, nullable=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="external_services")
