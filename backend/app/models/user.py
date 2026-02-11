from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    knowledge_bases = relationship("KnowledgeBase", back_populates="user", cascade="all, delete-orphan")
    agents = relationship("Agent", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    mcp_servers = relationship("McpServer", back_populates="user", cascade="all, delete-orphan")
    db_connections = relationship("DbConnection", back_populates="user", cascade="all, delete-orphan")
    external_services = relationship("ExternalService", back_populates="user", cascade="all, delete-orphan")
    conversation_feedbacks = relationship("ConversationFeedback", back_populates="user", cascade="all, delete-orphan")
    training_datasets = relationship("TrainingDataset", back_populates="user", cascade="all, delete-orphan")
    finetuning_jobs = relationship("FineTuningJob", back_populates="user", cascade="all, delete-orphan")