"""
config.py 단위 테스트
- Settings 클래스 검증
- 환경변수 파싱
- 프로덕션 설정 검증
"""
import os
import pytest
from unittest.mock import patch
from pydantic import ValidationError


class TestSettings:
    """Settings 클래스 테스트"""

    def _create_settings(self, **overrides):
        """테스트용 Settings 인스턴스 생성"""
        from app.core.config import Settings

        defaults = {
            "SECRET_KEY": "a-very-secure-secret-key-for-testing-purposes-1234",
            "DATABASE_URL": "sqlite+aiosqlite:///./test.db",
        }
        defaults.update(overrides)
        return Settings(**defaults)

    def test_default_values(self):
        """기본값이 올바르게 설정되는지 확인"""
        s = self._create_settings(DEBUG=False)
        assert s.PROJECT_NAME == "RAG AI Backend"
        assert s.API_V1_STR == "/api/v1"
        assert s.ALGORITHM == "HS256"
        assert s.DEBUG is False
        assert s.ENVIRONMENT == "development"

    def test_secret_key_minimum_length(self):
        """SECRET_KEY 최소 길이 검증"""
        with pytest.raises(ValidationError):
            self._create_settings(SECRET_KEY="short")

    def test_secret_key_rejects_default(self):
        """SECRET_KEY 기본값 거부"""
        with pytest.raises(ValidationError):
            self._create_settings(SECRET_KEY="CHANGE_THIS_TO_A_SUPER_SECRET_KEY")

    def test_secret_key_valid(self):
        """유효한 SECRET_KEY 통과"""
        s = self._create_settings(SECRET_KEY="a" * 32)
        assert len(s.SECRET_KEY) == 32

    def test_cors_origins_list_parsing(self):
        """CORS origins 문자열이 리스트로 파싱되는지 확인"""
        s = self._create_settings(CORS_ORIGINS="http://a.com, http://b.com")
        assert s.cors_origins_list == ["http://a.com", "http://b.com"]

    def test_cors_origins_single(self):
        """단일 CORS origin"""
        s = self._create_settings(CORS_ORIGINS="http://localhost:5173")
        assert s.cors_origins_list == ["http://localhost:5173"]

    def test_allowed_extensions_list(self):
        """파일 확장자 리스트 파싱"""
        s = self._create_settings(ALLOWED_FILE_EXTENSIONS=".pdf,.docx,.txt")
        assert s.allowed_extensions_list == [".pdf", ".docx", ".txt"]

    def test_max_upload_size_bytes(self):
        """최대 업로드 크기 바이트 변환"""
        s = self._create_settings(MAX_UPLOAD_SIZE_MB=10)
        assert s.max_upload_size_bytes == 10 * 1024 * 1024

    def test_access_token_expire_range(self):
        """토큰 만료 시간 범위 검증"""
        # 유효 범위
        s = self._create_settings(ACCESS_TOKEN_EXPIRE_MINUTES=30)
        assert s.ACCESS_TOKEN_EXPIRE_MINUTES == 30

        # 범위 초과
        with pytest.raises(ValidationError):
            self._create_settings(ACCESS_TOKEN_EXPIRE_MINUTES=0)

        with pytest.raises(ValidationError):
            self._create_settings(ACCESS_TOKEN_EXPIRE_MINUTES=1441)

    def test_llm_temperature_range(self):
        """LLM 온도 범위 검증"""
        s = self._create_settings(LLM_TEMPERATURE=0.5)
        assert s.LLM_TEMPERATURE == 0.5

        with pytest.raises(ValidationError):
            self._create_settings(LLM_TEMPERATURE=-0.1)

        with pytest.raises(ValidationError):
            self._create_settings(LLM_TEMPERATURE=2.1)

    def test_rag_chunk_size_range(self):
        """RAG 청크 크기 범위 검증"""
        s = self._create_settings(RAG_CHUNK_SIZE=500)
        assert s.RAG_CHUNK_SIZE == 500

        with pytest.raises(ValidationError):
            self._create_settings(RAG_CHUNK_SIZE=50)

        with pytest.raises(ValidationError):
            self._create_settings(RAG_CHUNK_SIZE=5000)

    def test_rate_limit_settings(self):
        """Rate Limit 설정 검증"""
        s = self._create_settings(RATE_LIMIT_AUTH_REQUESTS=5)
        assert s.RATE_LIMIT_AUTH_REQUESTS == 5
        assert s.RATE_LIMIT_WINDOW_SECONDS == 60

    def test_cache_settings(self):
        """캐시 설정 검증"""
        s = self._create_settings(CACHE_ENABLED=False, CACHE_TTL_SECONDS=1800)
        assert s.CACHE_ENABLED is False
        assert s.CACHE_TTL_SECONDS == 1800

    def test_optional_fields(self):
        """옵션 필드 기본값 확인"""
        s = self._create_settings()
        assert s.QDRANT_API_KEY is None
        assert s.REDIS_PASSWORD is None

    def test_production_warnings_debug(self):
        """프로덕션 환경 경고: DEBUG"""
        s = self._create_settings(ENVIRONMENT="production", DEBUG=True)
        warnings = s.validate_production_settings()
        assert any("DEBUG" in w for w in warnings)

    def test_production_warnings_localhost_cors(self):
        """프로덕션 환경 경고: localhost CORS"""
        s = self._create_settings(
            ENVIRONMENT="production",
            CORS_ORIGINS="http://localhost:5173"
        )
        warnings = s.validate_production_settings()
        assert any("localhost" in w and "CORS" in w for w in warnings)

    def test_production_warnings_no_neo4j_password(self):
        """프로덕션 환경 경고: Neo4j 비밀번호 없음"""
        s = self._create_settings(
            ENVIRONMENT="production",
            NEO4J_PASSWORD=""
        )
        warnings = s.validate_production_settings()
        assert any("Neo4j" in w for w in warnings)

    def test_development_no_warnings(self):
        """개발 환경에서는 경고 없음"""
        s = self._create_settings(ENVIRONMENT="development", DEBUG=True)
        warnings = s.validate_production_settings()
        assert len(warnings) == 0

    def test_extra_fields_ignored(self):
        """설정에 없는 필드는 무시"""
        s = self._create_settings(UNKNOWN_FIELD="value")
        assert not hasattr(s, "UNKNOWN_FIELD")
