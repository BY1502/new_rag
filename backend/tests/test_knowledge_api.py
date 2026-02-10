"""
knowledge.py API 엔드포인트 테스트
- 파일 업로드
- 파일 검증 (확장자, 크기)
"""
import io
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import status

from app.api.endpoints.knowledge import validate_file


class TestValidateFile:
    """파일 검증 함수 테스트"""

    def test_valid_pdf(self):
        """유효한 PDF 파일"""
        mock_file = MagicMock()
        mock_file.filename = "document.pdf"
        mock_file.size = 1024 * 1024  # 1MB
        validate_file(mock_file)  # 예외 없어야 함

    def test_valid_docx(self):
        """유효한 DOCX 파일"""
        mock_file = MagicMock()
        mock_file.filename = "document.docx"
        mock_file.size = 1024 * 1024
        validate_file(mock_file)

    def test_invalid_extension(self):
        """허용되지 않은 확장자"""
        from fastapi import HTTPException
        mock_file = MagicMock()
        mock_file.filename = "malware.exe"
        mock_file.size = 1024

        with pytest.raises(HTTPException) as exc_info:
            validate_file(mock_file)
        assert exc_info.value.status_code == 400

    def test_file_too_large(self):
        """파일 크기 초과"""
        from fastapi import HTTPException
        mock_file = MagicMock()
        mock_file.filename = "large.pdf"
        mock_file.size = 100 * 1024 * 1024  # 100MB (기본 제한 50MB)

        with pytest.raises(HTTPException) as exc_info:
            validate_file(mock_file)
        assert exc_info.value.status_code == 413

    def test_no_size_attribute(self):
        """size 속성 없는 파일 (검증 건너뜀)"""
        mock_file = MagicMock()
        mock_file.filename = "test.pdf"
        mock_file.size = None
        validate_file(mock_file)  # 예외 없어야 함

    def test_no_filename(self):
        """파일명 없는 경우"""
        mock_file = MagicMock()
        mock_file.filename = None
        mock_file.size = None
        validate_file(mock_file)  # 예외 없어야 함

    def test_txt_extension(self):
        """텍스트 파일 허용"""
        mock_file = MagicMock()
        mock_file.filename = "notes.txt"
        mock_file.size = 100
        validate_file(mock_file)

    def test_md_extension(self):
        """마크다운 파일 허용"""
        mock_file = MagicMock()
        mock_file.filename = "README.md"
        mock_file.size = 100
        validate_file(mock_file)


class TestUploadEndpoint:
    """파일 업로드 엔드포인트 테스트"""

    @pytest.mark.asyncio
    async def test_upload_success(self, authenticated_client):
        """정상 업로드"""
        with patch("app.api.endpoints.knowledge.get_ingestion_service") as mock_svc:
            mock_ingestion = AsyncMock()
            mock_ingestion.save_file = AsyncMock(
                return_value=("/tmp/test.pdf", "test.pdf")
            )
            mock_svc.return_value = mock_ingestion

            file_content = b"%PDF-1.4 test content"
            response = await authenticated_client.post(
                "/api/v1/knowledge/upload",
                files={"file": ("test.pdf", io.BytesIO(file_content), "application/pdf")},
                data={"kb_id": "test_kb"},
            )

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["filename"] == "test.pdf"
            assert data["kb_id"] == "test_kb"

    @pytest.mark.asyncio
    async def test_upload_invalid_extension(self, authenticated_client):
        """잘못된 확장자 업로드 거부"""
        response = await authenticated_client.post(
            "/api/v1/knowledge/upload",
            files={"file": ("hack.exe", io.BytesIO(b"evil"), "application/octet-stream")},
            data={"kb_id": "kb1"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.asyncio
    async def test_upload_requires_auth(self, async_client):
        """인증 없이 업로드 시도 거부"""
        response = await async_client.post(
            "/api/v1/knowledge/upload",
            files={"file": ("test.pdf", io.BytesIO(b"test"), "application/pdf")},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_upload_default_kb_id(self, authenticated_client):
        """kb_id 미지정 시 default_kb 사용"""
        with patch("app.api.endpoints.knowledge.get_ingestion_service") as mock_svc:
            mock_ingestion = AsyncMock()
            mock_ingestion.save_file = AsyncMock(
                return_value=("/tmp/doc.pdf", "doc.pdf")
            )
            mock_svc.return_value = mock_ingestion

            response = await authenticated_client.post(
                "/api/v1/knowledge/upload",
                files={"file": ("doc.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
            )

            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert data["kb_id"] == "default_kb"
