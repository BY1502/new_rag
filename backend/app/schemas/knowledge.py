"""
지식 베이스 관련 Pydantic 스키마
- 그래프 노드/엣지 CRUD
"""
from typing import Optional, Dict, List
from pydantic import BaseModel, Field, field_validator


ALLOWED_LABELS = {"Entity", "Concept", "Person", "Place", "Event", "Organization", "Document"}
ALLOWED_RELATIONSHIP_TYPES = {"RELATION", "INCLUDES", "INVOLVES", "CAUSES", "RELATED_TO", "HAS", "PART_OF"}


class NodeCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=50, description="노드 라벨")
    name: str = Field(..., min_length=1, max_length=200, description="노드 이름")
    properties: Dict[str, str] = Field(default_factory=dict, description="추가 속성")

    @field_validator("label")
    @classmethod
    def validate_label(cls, v):
        if v not in ALLOWED_LABELS:
            raise ValueError(f"허용된 라벨: {', '.join(sorted(ALLOWED_LABELS))}")
        return v


class NodeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    properties: Optional[Dict[str, str]] = None


class EdgeCreate(BaseModel):
    source_id: str = Field(..., description="소스 노드 elementId")
    target_id: str = Field(..., description="타겟 노드 elementId")
    relationship_type: str = Field(..., min_length=1, max_length=50, description="관계 유형")

    @field_validator("relationship_type")
    @classmethod
    def validate_relationship_type(cls, v):
        if v not in ALLOWED_RELATIONSHIP_TYPES:
            raise ValueError(f"허용된 관계 유형: {', '.join(sorted(ALLOWED_RELATIONSHIP_TYPES))}")
        return v
