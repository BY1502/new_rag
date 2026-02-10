"""
Pydantic 스키마 단위 테스트
- UserCreate 비밀번호 검증
- ChatRequest 필드 검증
"""
import pytest
from pydantic import ValidationError
from app.schemas.user import UserCreate, UserResponse, Token
from app.schemas.chat import ChatRequest


class TestUserCreate:
    """UserCreate 스키마 테스트"""

    def test_valid_user(self):
        """유효한 사용자 생성"""
        user = UserCreate(
            email="test@example.com",
            password="Test1234",
            name="테스트"
        )
        assert user.email == "test@example.com"
        assert user.name == "테스트"

    def test_password_too_short(self):
        """비밀번호 8자 미만 거부"""
        with pytest.raises(ValidationError):
            UserCreate(email="a@b.com", password="Te1", name="a")

    def test_password_no_letter(self):
        """비밀번호에 영문자 없으면 거부"""
        with pytest.raises(ValidationError):
            UserCreate(email="a@b.com", password="12345678", name="a")

    def test_password_no_digit(self):
        """비밀번호에 숫자 없으면 거부"""
        with pytest.raises(ValidationError):
            UserCreate(email="a@b.com", password="abcdefgh", name="a")

    def test_password_valid_complex(self):
        """복잡한 비밀번호 통과"""
        user = UserCreate(
            email="a@b.com",
            password="MyP@ssw0rd!",
            name="a"
        )
        assert user.password == "MyP@ssw0rd!"

    def test_invalid_email(self):
        """유효하지 않은 이메일 거부"""
        with pytest.raises(ValidationError):
            UserCreate(email="not-an-email", password="Test1234", name="a")

    def test_empty_name(self):
        """빈 이름 거부"""
        with pytest.raises(ValidationError):
            UserCreate(email="a@b.com", password="Test1234", name="")

    def test_name_too_long(self):
        """이름 100자 초과 거부"""
        with pytest.raises(ValidationError):
            UserCreate(email="a@b.com", password="Test1234", name="a" * 101)


class TestUserResponse:
    """UserResponse 스키마 테스트"""

    def test_from_dict(self):
        resp = UserResponse(
            id=1, email="a@b.com", name="test", is_active=True
        )
        assert resp.id == 1
        assert resp.is_active is True


class TestToken:
    """Token 스키마 테스트"""

    def test_token_schema(self):
        token = Token(access_token="abc123", token_type="bearer")
        assert token.access_token == "abc123"
        assert token.token_type == "bearer"


class TestChatRequest:
    """ChatRequest 스키마 테스트"""

    def test_valid_request(self):
        """유효한 채팅 요청"""
        req = ChatRequest(message="안녕하세요")
        assert req.message == "안녕하세요"
        assert req.kb_id == "default_kb"
        assert req.use_web_search is False
        assert req.use_deep_think is False
        assert req.active_mcp_ids == []

    def test_empty_message_rejected(self):
        """빈 메시지 거부"""
        with pytest.raises(ValidationError):
            ChatRequest(message="")

    def test_message_max_length(self):
        """메시지 최대 길이 초과 거부"""
        with pytest.raises(ValidationError):
            ChatRequest(message="a" * 10001)

    def test_full_request(self):
        """모든 필드 포함된 요청"""
        req = ChatRequest(
            message="테스트",
            kb_id="my_kb",
            model="llama3.1",
            use_web_search=True,
            use_deep_think=True,
            active_mcp_ids=["web-search", "calculator"]
        )
        assert req.kb_id == "my_kb"
        assert req.model == "llama3.1"
        assert req.use_web_search is True
        assert req.active_mcp_ids == ["web-search", "calculator"]

    def test_default_model_is_none(self):
        """기본 모델은 None"""
        req = ChatRequest(message="hello")
        assert req.model is None

    def test_kb_id_max_length(self):
        """kb_id 최대 길이 초과 거부"""
        with pytest.raises(ValidationError):
            ChatRequest(message="hello", kb_id="x" * 101)
