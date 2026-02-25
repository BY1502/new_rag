from typing import Optional
from pydantic import BaseModel, Field


class UserSettingsResponse(BaseModel):
    llm_model: str
    embedding_model: str
    vlm_model: str
    enable_multimodal: bool
    retrieval_mode: str
    search_top_k: int
    use_rerank: bool
    search_mode: str
    dense_weight: float = 0.5
    use_multimodal_search: bool
    system_prompt: Optional[str] = None
    custom_model: Optional[str] = None
    theme: str
    active_search_provider_id: str
    storage_type: str
    bucket_name: str

    class Config:
        from_attributes = True


class UserSettingsUpdate(BaseModel):
    llm_model: Optional[str] = Field(None, max_length=100)
    embedding_model: Optional[str] = Field(None, max_length=100)
    vlm_model: Optional[str] = Field(None, max_length=100)
    enable_multimodal: Optional[bool] = None
    retrieval_mode: Optional[str] = Field(None, pattern=r"^(hybrid|vector|graph)$")
    search_top_k: Optional[int] = Field(None, ge=1, le=20)
    use_rerank: Optional[bool] = None
    search_mode: Optional[str] = Field(None, pattern=r"^(dense|sparse|hybrid)$")
    dense_weight: Optional[float] = Field(None, ge=0.0, le=1.0)
    use_multimodal_search: Optional[bool] = None
    system_prompt: Optional[str] = Field(None, max_length=5000)
    custom_model: Optional[str] = Field(None, max_length=200)
    theme: Optional[str] = Field(None, pattern=r"^(Light|Dark)$")
    active_search_provider_id: Optional[str] = Field(None, max_length=50)
    storage_type: Optional[str] = Field(None, max_length=20)
    bucket_name: Optional[str] = Field(None, max_length=100)
