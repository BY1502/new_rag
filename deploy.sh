#!/bin/bash
# ============================================================
# RAG AI System - Production Deployment Script
# ============================================================
# 사용법: chmod +x deploy.sh && ./deploy.sh
# ============================================================

set -e

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="backend/.env.production"

# 색상
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ──────────────────────────────────────────────
# 1. 사전 점검
# ──────────────────────────────────────────────
log "사전 점검 시작..."

# Docker 확인
command -v docker >/dev/null 2>&1 || error "Docker가 설치되어 있지 않습니다."
docker compose version >/dev/null 2>&1 || error "Docker Compose가 설치되어 있지 않습니다."

# 환경 파일 확인
if [ ! -f "$ENV_FILE" ]; then
    error "$ENV_FILE 파일이 없습니다. backend/.env.production을 생성해주세요."
fi

# Ollama 확인
if command -v ollama >/dev/null 2>&1; then
    log "Ollama 감지됨"
    if ollama list >/dev/null 2>&1; then
        log "Ollama 모델 목록:"
        ollama list
    else
        warn "Ollama가 실행 중이 아닙니다. 'ollama serve' 를 먼저 실행해주세요."
    fi
else
    warn "Ollama가 설치되어 있지 않습니다. LLM 기능이 작동하지 않을 수 있습니다."
fi

# ──────────────────────────────────────────────
# 2. 빌드
# ──────────────────────────────────────────────
log "Docker 이미지 빌드 시작..."
docker compose -f "$COMPOSE_FILE" build --no-cache

# ──────────────────────────────────────────────
# 3. 기존 컨테이너 중지 (있으면)
# ──────────────────────────────────────────────
log "기존 컨테이너 중지..."
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true

# ──────────────────────────────────────────────
# 4. 시작
# ──────────────────────────────────────────────
log "서비스 시작..."
docker compose -f "$COMPOSE_FILE" up -d

# ──────────────────────────────────────────────
# 5. 헬스체크 대기
# ──────────────────────────────────────────────
log "서비스 시작 대기 중 (최대 120초)..."
TIMEOUT=120
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
    if curl -sf http://localhost/health >/dev/null 2>&1; then
        break
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo -n "."
done
echo ""

if [ $ELAPSED -ge $TIMEOUT ]; then
    warn "헬스체크 타임아웃. 로그를 확인하세요:"
    warn "  docker compose -f $COMPOSE_FILE logs backend"
    warn "  docker compose -f $COMPOSE_FILE logs frontend"
else
    log "헬스체크 통과!"
fi

# ──────────────────────────────────────────────
# 6. 상태 출력
# ──────────────────────────────────────────────
echo ""
log "============================================"
log "  RAG AI System 배포 완료!"
log "============================================"
echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""
log "서비스 URL:"
log "  웹 UI:      http://localhost"
log "  API Docs:   http://localhost/docs"
log "  Portainer:  http://localhost:9090"
log "  Health:     http://localhost/health"
echo ""
log "유용한 명령어:"
log "  로그 확인:    docker compose -f $COMPOSE_FILE logs -f"
log "  백엔드 로그:  docker compose -f $COMPOSE_FILE logs -f backend"
log "  서비스 중지:  docker compose -f $COMPOSE_FILE down"
log "  서비스 재시작: docker compose -f $COMPOSE_FILE restart"
