"""
MCP 서버 모델
"""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class McpServer(Base):
    __tablename__ = "mcp_servers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    server_id = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    server_type = Column(String(30), nullable=False)  # sse | streamableHttp | stdio
    url = Column(String(500), default="")
    command = Column(String(500), default="")
    headers_json = Column(Text, nullable=True)
    priority = Column(Integer, default=0)
    enabled = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="mcp_servers")
