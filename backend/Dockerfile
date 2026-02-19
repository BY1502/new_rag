# ============================================================
# RAG AI Backend - Production Dockerfile
# ============================================================
FROM python:3.11-slim AS base

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 의존성 설치 (캐시 레이어 활용)
COPY requirements.txt .

# PyTorch CPU 버전 설치 (GPU는 Ollama만 사용)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# 나머지 패키지 설치
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 이미지 저장 디렉토리 생성
RUN mkdir -p /app/storage/images

# 비root 사용자로 실행 (보안)
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app
USER appuser

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

# uvicorn 실행 (workers=2, 메모리 효율)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--timeout-keep-alive", "120"]
