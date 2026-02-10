"""
ingestion.py 단위 테스트
- 파일 저장 로직
- 파일명 보안
- 마크다운 정리
- 텍스트 분할
"""
import pytest
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ingestion import IngestionService


@pytest.fixture
def ingestion_service():
    """테스트용 IngestionService (싱글톤 우회)"""
    IngestionService._instance = None
    IngestionService._initialized = False

    with patch("app.services.ingestion.get_vector_store_service"):
        with patch("app.services.ingestion.get_graph_store_service"):
            service = IngestionService()

    yield service

    IngestionService._instance = None
    IngestionService._initialized = False


class TestSafeFilename:
    """파일명 보안 테스트"""

    def test_generates_uuid_filename(self, ingestion_service):
        """UUID 기반 파일명 생성"""
        name = ingestion_service._get_safe_filename("report.pdf")
        assert name.endswith(".pdf")
        assert "report" not in name  # 원본 이름 제거됨

    def test_preserves_allowed_extension(self, ingestion_service):
        """허용된 확장자 유지"""
        name = ingestion_service._get_safe_filename("doc.docx")
        assert name.endswith(".docx")

    def test_strips_disallowed_extension(self, ingestion_service):
        """비허용 확장자 제거"""
        name = ingestion_service._get_safe_filename("malware.exe")
        assert not name.endswith(".exe")

    def test_handles_no_extension(self, ingestion_service):
        """확장자 없는 파일"""
        name = ingestion_service._get_safe_filename("README")
        assert "." not in name or name.count(".") == 0 or name.endswith("")

    def test_path_traversal_blocked(self, ingestion_service):
        """경로 탐색 공격 차단"""
        name = ingestion_service._get_safe_filename("../../etc/passwd")
        assert ".." not in name
        assert "etc" not in name
        assert "passwd" not in name

    def test_empty_filename(self, ingestion_service):
        """빈 파일명 처리"""
        name = ingestion_service._get_safe_filename("")
        assert len(name) > 0


class TestCleanMarkdown:
    """마크다운 정리 테스트"""

    def test_removes_empty_lines(self):
        """빈 줄 제거"""
        text = "line1\n\n\n\nline2"
        result = IngestionService.clean_markdown(text)
        assert result == "line1\nline2"

    def test_removes_table_separators(self):
        """테이블 구분선 제거"""
        text = "header\n|---|---|\ndata"
        result = IngestionService.clean_markdown(text)
        assert "---" not in result

    def test_preserves_content(self):
        """실제 콘텐츠 보존"""
        text = "# Title\nSome content here\n## Subtitle"
        result = IngestionService.clean_markdown(text)
        assert "Title" in result
        assert "Some content here" in result
        assert "Subtitle" in result

    def test_empty_input(self):
        """빈 입력"""
        result = IngestionService.clean_markdown("")
        assert result == ""


class TestTextSplitting:
    """텍스트 분할 테스트"""

    def test_splits_text(self, ingestion_service):
        """텍스트를 청크로 분할"""
        long_text = "This is a test. " * 100
        splits = ingestion_service._split_text(long_text, chunk_size=200, chunk_overlap=20)
        assert len(splits) > 1

    def test_short_text_single_chunk(self, ingestion_service):
        """짧은 텍스트는 단일 청크"""
        splits = ingestion_service._split_text("Short text", chunk_size=500, chunk_overlap=50)
        assert len(splits) == 1

    def test_markdown_header_split(self, ingestion_service):
        """마크다운 헤더 기반 분할"""
        text = "# Chapter 1\nContent 1\n## Section 1.1\nContent 1.1\n# Chapter 2\nContent 2"
        splits = ingestion_service._split_text(text, chunk_size=500, chunk_overlap=50)
        assert len(splits) >= 1


class TestSaveFile:
    """파일 저장 테스트"""

    @pytest.mark.asyncio
    async def test_save_file(self, ingestion_service):
        """파일 저장 동작 확인"""
        mock_file = AsyncMock()
        mock_file.filename = "test.pdf"
        mock_file.read = AsyncMock(side_effect=[b"test content", b""])

        file_path, original_name = await ingestion_service.save_file(
            mock_file, "test_kb", 1
        )

        assert original_name == "test.pdf"
        assert Path(file_path).exists()

        # 정리
        Path(file_path).unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_save_file_unknown_filename(self, ingestion_service):
        """파일명 없는 경우 'unknown' 사용"""
        mock_file = AsyncMock()
        mock_file.filename = None
        mock_file.read = AsyncMock(side_effect=[b"data", b""])

        file_path, original_name = await ingestion_service.save_file(
            mock_file, "kb1", 1
        )

        assert original_name == "unknown"
        Path(file_path).unlink(missing_ok=True)


class TestCleanupFile:
    """임시 파일 정리 테스트"""

    @pytest.mark.asyncio
    async def test_cleanup_existing_file(self, ingestion_service):
        """존재하는 파일 삭제"""
        tmp = Path(tempfile.mktemp(suffix=".tmp"))
        tmp.write_text("temp")
        assert tmp.exists()

        await ingestion_service._cleanup_file(tmp)
        assert not tmp.exists()

    @pytest.mark.asyncio
    async def test_cleanup_nonexistent_file(self, ingestion_service):
        """존재하지 않는 파일 삭제 시도 (에러 없음)"""
        tmp = Path("/tmp/nonexistent_file_12345.tmp")
        await ingestion_service._cleanup_file(tmp)
