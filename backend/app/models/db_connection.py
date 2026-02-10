"""
DB 커넥션 모델 (Text-to-SQL용)
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class DbConnection(Base):
    __tablename__ = "db_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    conn_id = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    db_type = Column(String(20), nullable=False)  # postgresql | mysql | sqlite
    host = Column(String(255), default="")
    port = Column(Integer, default=5432)
    database = Column(String(255), default="")
    username = Column(String(255), default="")
    encrypted_password = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="db_connections")
