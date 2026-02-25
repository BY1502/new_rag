"""
애플리케이션 설정
환경변수를 통해 설정을 관리합니다.
"""
import logging
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """애플리케이션 설정"""

    # ============================================================
    # 기본 설정
    # ============================================================
    PROJECT_NAME: str = "RAG AI Backend"
    API_V1_STR: str = "/api/v1"

    # 환경 설정
    DEBUG: bool = False
    ENVIRONMENT: str = Field(
        default="development",
        description="development, staging, production"
    )

    # ============================================================
    # CORS 설정
    # ============================================================
    CORS_ORIGINS: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        description="쉼표로 구분된 허용 Origin 목록"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        """CORS Origin 리스트 반환"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # ============================================================
    # 인증 설정
    # ============================================================
    SECRET_KEY: str = Field(
        ...,
        min_length=32,
        description="JWT 서명용 비밀키 (최소 32자)"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, ge=1, le=1440)

    @field_validator('SECRET_KEY')
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if v == "CHANGE_THIS_TO_A_SUPER_SECRET_KEY":
            raise ValueError("SECRET_KEY를 변경해주세요. 기본값은 보안에 취약합니다.")
        if len(v) < 32:
            raise ValueError("SECRET_KEY는 최소 32자 이상이어야 합니다.")
        return v

    # ============================================================
    # 파일 업로드 설정
    # ============================================================
    MAX_UPLOAD_SIZE_MB: int = Field(default=50, ge=1, le=500)
    ALLOWED_FILE_EXTENSIONS: str = ".pdf,.docx,.doc,.txt,.md,.pptx,.xlsx,.hwp,.hwpx,.jpg,.jpeg,.png,.gif,.webp"

    @property
    def allowed_extensions_list(self) -> List[str]:
        """허용된 파일 확장자 리스트 반환"""
        return [ext.strip().lower() for ext in self.ALLOWED_FILE_EXTENSIONS.split(",")]

    @property
    def max_upload_size_bytes(self) -> int:
        """최대 업로드 크기 (바이트)"""
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    # ============================================================
    # Rate Limiting 설정
    # ============================================================
    RATE_LIMIT_REQUESTS: int = Field(default=100, ge=1, description="분당 일반 요청 수")
    RATE_LIMIT_AUTH_REQUESTS: int = Field(default=10, ge=1, description="분당 인증 요청 수")
    RATE_LIMIT_WINDOW_SECONDS: int = Field(default=60, ge=1, description="Rate Limit 윈도우 (초)")

    # ============================================================
    # 데이터베이스 설정
    # ============================================================
    DATABASE_URL: str = Field(
        ...,
        description="PostgreSQL 연결 URL"
    )

    # Qdrant Vector DB
    QDRANT_URL: str = Field(
        default="http://localhost:6333",
        description="Qdrant Vector DB URL"
    )
    QDRANT_API_KEY: Optional[str] = Field(default=None, description="Qdrant API Key (옵션)")

    # Redis
    REDIS_URL: str = Field(
        default="redis://localhost:6379",
        description="Redis 연결 URL"
    )
    REDIS_PASSWORD: Optional[str] = Field(default=None, description="Redis 비밀번호 (옵션)")

    # 캐시 설정
    CACHE_TTL_SECONDS: int = Field(default=3600, ge=60, description="캐시 TTL (초)")
    CACHE_ENABLED: bool = Field(default=True, description="캐시 활성화 여부")

    # ============================================================
    # Neo4j Graph DB 설정
    # ============================================================
    NEO4J_URL: str = Field(
        default="neo4j://localhost:7687",
        description="Neo4j 연결 URL"
    )
    NEO4J_USERNAME: str = "neo4j"
    NEO4J_PASSWORD: str = Field(default="", description="Neo4j 비밀번호")

    # ============================================================
    # LLM 설정
    # ============================================================
    OLLAMA_BASE_URL: str = Field(
        default="http://localhost:11434",
        description="Ollama 서버 URL"
    )
    EMBEDDING_MODEL: str = Field(
        default="BAAI/bge-m3",
        description="임베딩 모델명"
    )
    EMBEDDING_DIMENSION: int = Field(
        default=1024,
        description="텍스트 임베딩 차원 (BGE-m3: 1024)"
    )
    CLIP_MODEL: str = Field(
        default="openai/clip-vit-base-patch32",
        description="CLIP 멀티모달 임베딩 모델명"
    )
    CLIP_DIMENSION: int = Field(
        default=512,
        description="CLIP 임베딩 차원 (ViT-B/32: 512)"
    )
    LLM_MODEL: str = Field(
        default="llama3.1",
        description="기본 LLM 모델명"
    )
    VISION_MODEL: str = Field(
        default="llava",
        description="멀티모달 Vision LLM 모델명 (이미지 분석용)"
    )
    LLM_TEMPERATURE: float = Field(default=0.0, ge=0.0, le=2.0)
    LLM_MAX_TOKENS: int = Field(default=4096, ge=256, le=32768)

    # ============================================================
    # RAG 설정
    # ============================================================
    RAG_TOP_K: int = Field(default=5, ge=1, le=20, description="검색 결과 개수")
    RAG_CHUNK_SIZE: int = Field(default=500, ge=100, le=4000, description="청크 크기")
    RAG_CHUNK_OVERLAP: int = Field(default=50, ge=0, le=500, description="청크 오버랩")
    RERANKER_MODEL: str = Field(
        default="BAAI/bge-reranker-v2-m3",
        description="Cross-Encoder 리랭커 모델명"
    )
    EMBEDDING_DEVICE: str = Field(
        default="auto",
        description="임베딩/리랭커 모델 디바이스 (auto, cpu, cuda). auto는 GPU 여유 메모리를 확인하여 자동 결정"
    )

    # ============================================================
    # 이미지 저장 설정
    # ============================================================
    IMAGE_STORAGE_DIR: str = Field(
        default="storage/images",
        description="이미지 파일 저장 디렉토리 (backend/ 기준 상대 경로)"
    )

    # ============================================================
    # 멀티모달 성능 최적화
    # ============================================================
    CLIP_BATCH_SIZE: int = Field(default=8, description="CLIP 임베딩 배치 크기")
    CAPTION_BATCH_SIZE: int = Field(default=4, description="캡셔닝 배치 크기")
    ENABLE_THUMBNAIL: bool = Field(default=True, description="썸네일 생성 활성화")
    ENABLE_OCR: bool = Field(default=True, description="OCR 활성화")
    ENABLE_CAPTIONING: bool = Field(default=True, description="이미지 캡셔닝 활성화")

    # ============================================================
    # 로깅 설정
    # ============================================================
    LOG_LEVEL: str = Field(default="INFO", description="로그 레벨")
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def validate_production_settings(self) -> List[str]:
        """
        프로덕션 환경 설정 검증
        Returns:
            경고 메시지 리스트
        """
        warnings = []

        if self.ENVIRONMENT == "production":
            if self.DEBUG:
                warnings.append("프로덕션 환경에서 DEBUG=True는 권장되지 않습니다.")

            if "localhost" in self.CORS_ORIGINS:
                warnings.append("프로덕션 환경에서 localhost CORS는 권장되지 않습니다.")

            if not self.NEO4J_PASSWORD:
                warnings.append("Neo4j 비밀번호가 설정되지 않았습니다.")

            if "localhost" in self.DATABASE_URL:
                warnings.append("프로덕션 환경에서 localhost DB는 권장되지 않습니다.")

        return warnings


# 설정 인스턴스 생성
settings = Settings()

# 프로덕션 환경 경고 출력
_warnings = settings.validate_production_settings()
for warning in _warnings:
    logger.warning(f"[CONFIG] {warning}")
