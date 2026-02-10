import re
from pydantic import BaseModel, EmailStr, Field, field_validator


class UserBase(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=100)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=100)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        """비밀번호 강도 검증"""
        if len(v) < 8:
            raise ValueError('비밀번호는 최소 8자 이상이어야 합니다.')
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('비밀번호에는 최소 하나의 영문자가 포함되어야 합니다.')
        if not re.search(r'\d', v):
            raise ValueError('비밀번호에는 최소 하나의 숫자가 포함되어야 합니다.')
        return v


class UserResponse(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
