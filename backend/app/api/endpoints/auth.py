"""
인증 API 엔드포인트
- 회원가입
- 로그인
- Rate Limiting (Redis 기반)
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.security import create_access_token, verify_password, get_dummy_hash
from app.schemas.user import UserCreate, UserResponse, Token
from app.crud.user import create_user, get_user_by_email
from app.core.config import settings
from app.services.cache_service import get_cache_service

logger = logging.getLogger(__name__)
router = APIRouter()


async def check_rate_limit(request: Request, max_requests: int = 10):
    """
    IP 기반 Rate Limiting (Redis 사용, 폴백: 인메모리)
    """
    client_ip = request.client.host if request.client else "unknown"

    cache = get_cache_service()
    allowed, current_count, remaining = await cache.check_rate_limit(
        identifier=f"auth:{client_ip}",
        max_requests=max_requests,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS
    )

    if not allowed:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"요청이 너무 많습니다. {remaining}초 후에 다시 시도해주세요.",
            headers={"Retry-After": str(remaining)}
        )


@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    회원가입
    """
    # Rate limiting
    await check_rate_limit(request, max_requests=settings.RATE_LIMIT_AUTH_REQUESTS)

    # 1. 이메일 중복 확인
    existing_user = await get_user_by_email(db, user_in.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 등록된 이메일입니다.",
        )

    # 2. 유저 생성
    try:
        user = await create_user(db, user_in)

        # 3. 기본 사용자 설정 생성
        from app.crud.user_settings import create_default_settings
        await create_default_settings(db, user.id)

        # 4. 기본 지식 베이스 생성
        from app.crud.knowledge_base import create_knowledge_base
        await create_knowledge_base(db, user.id, "default", "기본 지식 베이스", "기본 문서 저장소")

        # 5. 기본 에이전트 생성
        from app.crud.agent import create_agent
        await create_agent(db, user.id, agent_id="agent-general", name="일반 대화 비서",
                           description="지식 베이스 없이 자유로운 주제로 대화하는 범용 AI 비서입니다.",
                           model="gemma3:12b", system_prompt="당신은 RAG AI 비서입니다.", sort_order=0)
        await create_agent(db, user.id, agent_id="agent-rag", name="문서 분석 전문가",
                           description="업로드된 문서를 기반으로 정확하게 답변하는 RAG 에이전트입니다.",
                           model="gemma3:12b", system_prompt="당신은 RAG 문서 분석 전문가입니다.", sort_order=1)

        logger.info(f"새 사용자 등록: {user.email}")
        return user
    except Exception as e:
        logger.error(f"사용자 생성 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="사용자 생성 중 오류가 발생했습니다."
        )


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    로그인 (OAuth2 Password Flow)
    """
    # Rate limiting - 로그인은 더 엄격하게
    await check_rate_limit(request, max_requests=settings.RATE_LIMIT_AUTH_REQUESTS)

    # 1. 유저 조회
    user = await get_user_by_email(db, form_data.username)

    # 2. 비밀번호 검증 (타이밍 공격 방지를 위해 항상 검증 수행)
    if user:
        password_valid = verify_password(form_data.password, user.hashed_password)
    else:
        # 사용자가 없어도 동일한 시간 소요하도록 더미 해시 검증
        verify_password(form_data.password, get_dummy_hash())
        password_valid = False

    if not user or not password_valid:
        logger.warning(f"로그인 실패: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. 비활성 사용자 체크
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다."
        )

    # 4. 토큰 발급
    access_token = create_access_token(data={"sub": user.email})
    logger.info(f"로그인 성공: {user.email}")

    return {"access_token": access_token, "token_type": "bearer"}
