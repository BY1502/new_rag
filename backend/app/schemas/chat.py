from pydantic import BaseModel
from typing import Optional, List

class ChatRequest(BaseModel):
    message: str
    kb_id: str
    model: Optional[str] = None       # ✅ 추가: 프론트에서 선택한 모델명
    use_web_search: bool = False
    use_deep_think: bool = False      # ✅ 추가: 딥 씽킹 활성화 여부
    active_mcp_ids: List[str] = []