"""
auth.py API 엔드포인트 테스트
- 회원가입
- 로그인
- Rate Limiting
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import status

from app.schemas.user import UserCreate


class TestRegisterEndpoint:
    """회원가입 엔드포인트 테스트"""

    @pytest.mark.asyncio
    async def test_register_success(self, async_client, db_session):
        """정상 회원가입"""
        with patch("app.api.endpoints.auth.check_rate_limit", new_callable=AsyncMock):
            with patch("app.api.endpoints.auth.get_user_by_email", new_callable=AsyncMock) as mock_get:
                with patch("app.api.endpoints.auth.create_user", new_callable=AsyncMock) as mock_create:
                    mock_get.return_value = None  # 미등록 이메일
                    mock_user = MagicMock()
                    mock_user.id = 1
                    mock_user.email = "new@example.com"
                    mock_user.name = "새유저"
                    mock_user.is_active = True
                    mock_create.return_value = mock_user

                    response = await async_client.post(
                        "/api/v1/auth/register",
                        json={
                            "email": "new@example.com",
                            "password": "NewPass123",
                            "name": "새유저",
                        },
                    )

                    assert response.status_code == status.HTTP_200_OK
                    data = response.json()
                    assert data["email"] == "new@example.com"

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, async_client, db_session):
        """중복 이메일 거부"""
        with patch("app.api.endpoints.auth.check_rate_limit", new_callable=AsyncMock):
            with patch("app.api.endpoints.auth.get_user_by_email", new_callable=AsyncMock) as mock_get:
                mock_get.return_value = MagicMock()  # 이미 등록된 유저 반환

                response = await async_client.post(
                    "/api/v1/auth/register",
                    json={
                        "email": "existing@example.com",
                        "password": "Pass1234",
                        "name": "기존유저",
                    },
                )

                assert response.status_code == status.HTTP_409_CONFLICT

    @pytest.mark.asyncio
    async def test_register_invalid_password(self, async_client):
        """유효하지 않은 비밀번호 거부 (숫자 없음)"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "a@b.com",
                "password": "nodigits",
                "name": "test",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.asyncio
    async def test_register_short_password(self, async_client):
        """짧은 비밀번호 거부"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "a@b.com",
                "password": "Ab1",
                "name": "test",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.asyncio
    async def test_register_invalid_email(self, async_client):
        """유효하지 않은 이메일 거부"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "not-email",
                "password": "Pass1234",
                "name": "test",
            },
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestLoginEndpoint:
    """로그인 엔드포인트 테스트"""

    @pytest.mark.asyncio
    async def test_login_success(self, async_client, db_session):
        """정상 로그인"""
        from app.core.security import get_password_hash

        with patch("app.api.endpoints.auth.check_rate_limit", new_callable=AsyncMock):
            with patch("app.api.endpoints.auth.get_user_by_email", new_callable=AsyncMock) as mock_get:
                mock_user = MagicMock()
                mock_user.email = "user@example.com"
                mock_user.hashed_password = get_password_hash("Pass1234")
                mock_user.is_active = True
                mock_get.return_value = mock_user

                response = await async_client.post(
                    "/api/v1/auth/login",
                    data={
                        "username": "user@example.com",
                        "password": "Pass1234",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                assert "access_token" in data
                assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, async_client, db_session):
        """잘못된 비밀번호"""
        from app.core.security import get_password_hash

        with patch("app.api.endpoints.auth.check_rate_limit", new_callable=AsyncMock):
            with patch("app.api.endpoints.auth.get_user_by_email", new_callable=AsyncMock) as mock_get:
                mock_user = MagicMock()
                mock_user.email = "user@example.com"
                mock_user.hashed_password = get_password_hash("CorrectPass1")
                mock_user.is_active = True
                mock_get.return_value = mock_user

                response = await async_client.post(
                    "/api/v1/auth/login",
                    data={
                        "username": "user@example.com",
                        "password": "WrongPass1",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, async_client, db_session):
        """존재하지 않는 사용자"""
        with patch("app.api.endpoints.auth.check_rate_limit", new_callable=AsyncMock):
            with patch("app.api.endpoints.auth.get_user_by_email", new_callable=AsyncMock) as mock_get:
                mock_get.return_value = None

                response = await async_client.post(
                    "/api/v1/auth/login",
                    data={
                        "username": "ghost@example.com",
                        "password": "Pass1234",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_login_inactive_user(self, async_client, db_session):
        """비활성 사용자 로그인 거부"""
        from app.core.security import get_password_hash

        with patch("app.api.endpoints.auth.check_rate_limit", new_callable=AsyncMock):
            with patch("app.api.endpoints.auth.get_user_by_email", new_callable=AsyncMock) as mock_get:
                mock_user = MagicMock()
                mock_user.email = "inactive@example.com"
                mock_user.hashed_password = get_password_hash("Pass1234")
                mock_user.is_active = False
                mock_get.return_value = mock_user

                response = await async_client.post(
                    "/api/v1/auth/login",
                    data={
                        "username": "inactive@example.com",
                        "password": "Pass1234",
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                assert response.status_code == status.HTTP_403_FORBIDDEN


class TestRateLimit:
    """Rate Limiting 테스트"""

    @pytest.mark.asyncio
    async def test_rate_limit_blocks(self, async_client, db_session):
        """Rate Limit 초과 시 429 반환"""
        with patch("app.api.endpoints.auth.get_cache_service") as mock_cache_factory:
            mock_cache = AsyncMock()
            mock_cache.check_rate_limit = AsyncMock(return_value=(False, 11, 45))
            mock_cache_factory.return_value = mock_cache

            response = await async_client.post(
                "/api/v1/auth/login",
                data={
                    "username": "user@example.com",
                    "password": "Pass1234",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
