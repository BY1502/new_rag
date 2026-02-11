from pydantic import BaseModel, Field
from typing import Optional, List


class ChatMessage(BaseModel):
    role: str = Field(..., description="메시지 역할 (user/assistant)")
    content: str = Field(..., description="메시지 내용")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=50000, description="채팅 메시지 (첨부 파일 텍스트 포함 가능)")
    kb_ids: List[str] = Field(default=["default_kb"], description="지식 베이스 ID 목록 (다중 선택)")
    model: Optional[str] = Field(default=None, max_length=100, description="사용할 모델명")
    system_prompt: Optional[str] = Field(default=None, max_length=5000, description="에이전트 시스템 프롬프트")
    history: List[ChatMessage] = Field(default_factory=list, description="이전 대화 기록 (최근 N턴)")
    use_web_search: bool = Field(default=False, description="웹 검색 사용 여부")
    use_deep_think: bool = Field(default=False, description="딥 씽킹 활성화 여부")
    active_mcp_ids: List[str] = Field(default_factory=list, description="활성화된 MCP 서버 ID 목록")
    top_k: Optional[int] = Field(default=None, ge=1, le=20, description="검색 결과 개수 (없으면 서버 기본값)")
    use_rerank: bool = Field(default=False, description="Rerank 사용 여부")
    search_provider: Optional[str] = Field(default=None, max_length=50, description="검색 공급자 ID (ddg, serper)")
    use_sql: bool = Field(default=False, description="Text-to-SQL 모드 사용 여부")
    db_connection_id: Optional[str] = Field(default=None, max_length=100, description="T2SQL용 DB 연결 ID")

    class Config:
        json_schema_extra = {
            "example": {
                "message": "안녕하세요, 도움이 필요합니다.",
                "kb_ids": ["default_kb"],
                "model": "gemma3:12b",
                "system_prompt": None,
                "history": [],
                "use_web_search": False,
                "use_deep_think": False,
                "active_mcp_ids": [],
                "top_k": 5,
                "use_rerank": False,
                "search_provider": "ddg"
            }
        }
