from pydantic import BaseModel
from typing import Optional, List

class ChatRequest(BaseModel):
    message: str
    kb_id: str
    use_web_search: bool = False
    use_deep_think: bool = False # ✅ 추가됨
    active_mcp_ids: List[str] = []