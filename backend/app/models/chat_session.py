"""
채팅 세션 + 메시지 모델
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    agent_pk = Column(Integer, ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(500), default="새로운 대화")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="sessions")
    agent = relationship("Agent", back_populates="sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan",
                            order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_pk = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # user | assistant | system
    content = Column(Text, default="")
    thinking = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    session = relationship("ChatSession", back_populates="messages")
