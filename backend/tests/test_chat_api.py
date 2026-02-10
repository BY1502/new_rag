"""
chat.py API 엔드포인트 테스트
- 스트리밍 채팅
- 인증 필수 확인
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import status


class TestChatStreamEndpoint:
    """채팅 스트리밍 엔드포인트 테스트"""

    @pytest.mark.asyncio
    async def test_chat_requires_auth(self, async_client):
        """인증 없이 채팅 시도 거부"""
        response = await async_client.post(
            "/api/v1/chat/stream",
            json={"message": "안녕하세요"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_chat_stream_success(self, authenticated_client):
        """정상 스트리밍 채팅"""
        async def mock_generate(*args, **kwargs):
            yield json.dumps({"type": "content", "content": "안녕하세요!"}) + "\n"

        with patch("app.api.endpoints.chat.get_rag_service") as mock_svc:
            mock_rag = MagicMock()
            mock_rag.generate_response = mock_generate
            mock_svc.return_value = mock_rag

            response = await authenticated_client.post(
                "/api/v1/chat/stream",
                json={"message": "안녕하세요"},
            )

            assert response.status_code == status.HTTP_200_OK
            assert "text/event-stream" in response.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_chat_empty_message_rejected(self, authenticated_client):
        """빈 메시지 거부"""
        response = await authenticated_client.post(
            "/api/v1/chat/stream",
            json={"message": ""},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.asyncio
    async def test_chat_with_options(self, authenticated_client):
        """옵션 포함 채팅"""
        async def mock_generate(*args, **kwargs):
            yield json.dumps({"type": "content", "content": "응답"}) + "\n"

        with patch("app.api.endpoints.chat.get_rag_service") as mock_svc:
            mock_rag = MagicMock()
            mock_rag.generate_response = mock_generate
            mock_svc.return_value = mock_rag

            response = await authenticated_client.post(
                "/api/v1/chat/stream",
                json={
                    "message": "테스트 질문",
                    "kb_id": "custom_kb",
                    "model": "llama3.1",
                    "use_web_search": True,
                    "use_deep_think": True,
                    "active_mcp_ids": ["web-search"],
                },
            )

            assert response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_chat_message_too_long(self, authenticated_client):
        """메시지 최대 길이 초과"""
        response = await authenticated_client.post(
            "/api/v1/chat/stream",
            json={"message": "a" * 10001},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestHealthEndpoint:
    """헬스 체크 엔드포인트 테스트"""

    @pytest.mark.asyncio
    async def test_health_check(self, async_client):
        """헬스 체크 성공"""
        with patch("app.main.get_cache_service") as mock_cache_factory:
            mock_cache = MagicMock()
            mock_cache.is_connected = True
            mock_cache_factory.return_value = mock_cache

            response = await async_client.get("/health")
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_root_endpoint(self, async_client):
        """루트 엔드포인트"""
        response = await async_client.get("/")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "message" in data
        assert "RAG" in data["message"]
