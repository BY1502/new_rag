"""
security.py 단위 테스트
- 비밀번호 해싱/검증
- JWT 토큰 생성/검증
- 더미 해시 함수
"""
import pytest
from datetime import timedelta
from jose import jwt

from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_dummy_hash,
)
from app.core.config import settings


class TestPasswordHashing:
    """비밀번호 해싱 테스트"""

    def test_hash_password(self):
        """비밀번호 해싱"""
        hashed = get_password_hash("MyPassword123")
        assert hashed != "MyPassword123"
        assert hashed.startswith("$2b$")

    def test_verify_correct_password(self):
        """올바른 비밀번호 검증"""
        password = "MyPassword123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password(self):
        """잘못된 비밀번호 검증"""
        hashed = get_password_hash("CorrectPass123")
        assert verify_password("WrongPass123", hashed) is False

    def test_different_hashes_for_same_password(self):
        """같은 비밀번호라도 다른 해시 생성 (salt)"""
        h1 = get_password_hash("SamePassword123")
        h2 = get_password_hash("SamePassword123")
        assert h1 != h2

    def test_empty_password(self):
        """빈 비밀번호도 해시 가능 (검증은 실패)"""
        hashed = get_password_hash("")
        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False


class TestDummyHash:
    """더미 해시 테스트"""

    def test_dummy_hash_format(self):
        """더미 해시가 bcrypt 형식인지 확인"""
        dummy = get_dummy_hash()
        assert dummy.startswith("$2b$")

    def test_dummy_hash_consistent(self):
        """더미 해시가 항상 같은 값인지 확인"""
        assert get_dummy_hash() == get_dummy_hash()

    def test_dummy_hash_verifiable(self):
        """더미 해시에 대해 비밀번호 검증이 동작하는지 확인 (타이밍 공격 방지)"""
        result = verify_password("random_password", get_dummy_hash())
        # 결과는 False여야 하지만 실행 자체는 성공
        assert result is False


class TestJWTToken:
    """JWT 토큰 테스트"""

    def test_create_token(self):
        """토큰 생성"""
        token = create_access_token(data={"sub": "test@example.com"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_token(self):
        """토큰 디코딩"""
        email = "test@example.com"
        token = create_access_token(data={"sub": email})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == email

    def test_token_has_exp_and_iat(self):
        """토큰에 exp, iat 필드 포함"""
        token = create_access_token(data={"sub": "test@example.com"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert "exp" in payload
        assert "iat" in payload

    def test_custom_expiration(self):
        """커스텀 만료 시간"""
        token = create_access_token(
            data={"sub": "test@example.com"},
            expires_delta=timedelta(minutes=5)
        )
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # exp - iat 차이가 대략 5분 (300초)
        diff = payload["exp"] - payload["iat"]
        assert 290 <= diff <= 310

    def test_default_expiration(self):
        """기본 만료 시간"""
        token = create_access_token(data={"sub": "test@example.com"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        diff = payload["exp"] - payload["iat"]
        expected = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        assert abs(diff - expected) <= 10

    def test_token_additional_data(self):
        """토큰에 추가 데이터 포함"""
        token = create_access_token(
            data={"sub": "test@example.com", "role": "admin"}
        )
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["role"] == "admin"

    def test_token_wrong_key_fails(self):
        """잘못된 키로 디코딩 실패"""
        token = create_access_token(data={"sub": "test@example.com"})
        with pytest.raises(Exception):
            jwt.decode(token, "wrong-key-that-is-incorrect", algorithms=[settings.ALGORITHM])
