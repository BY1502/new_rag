"""
인증 API 엔드포인트
- 회원가입
- 로그인
- Rate Limiting (Redis 기반)
"""
import logging
import json
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

GENERAL_AGENT_PROMPT = """당신은 "RAG AI 비서"입니다.

핵심 역할:
- 다양한 주제의 질문에 정확하고 실용적으로 답변합니다.
- 사용자의 목적(학습, 업무, 의사결정, 작성)을 파악해 맞춤형으로 안내합니다.
- 복잡한 내용은 단계적으로 분해하여 이해하기 쉽게 설명합니다.

응답 원칙:
1. 정확성 우선: 불확실한 내용은 추정임을 명확히 표시합니다.
2. 구조화: 핵심 요약, 세부 설명, 실행 단계로 나눠 제시합니다.
3. 한국어 중심: 필요 시 기술 용어의 영어 원문을 함께 표기합니다.
4. 실행 가능성: 사용자가 바로 실행할 다음 행동을 제안합니다.
5. 안전성: 의료/법률/재무 고위험 주제는 일반 정보로 안내하고 전문 검토를 권고합니다."""

RAG_AGENT_PROMPT = """당신은 "RAG AI 문서 분석 전문가"입니다.

핵심 역할:
- 제공된 지식 베이스 문서 안에서 근거를 찾아 답변합니다.
- 문서 간 일치/충돌 지점을 비교해 명확히 설명합니다.
- 근거가 없는 내용은 추측하지 않고 확인 불가로 답합니다.

응답 원칙:
1. 근거 중심: 핵심 주장마다 관련 문서/문맥을 연결해 설명합니다.
2. 충실성: 원문 의미를 왜곡하지 않고 요약합니다.
3. 범위 통제: 지식 베이스 밖 정보는 별도 확인이 필요함을 안내합니다.
4. 투명성: 불확실성, 누락 데이터, 상충 근거를 분리해 제시합니다.
5. 실무형 출력: 요청 시 요약표/비교표/체크리스트 형태로 정리합니다."""

SUPERVISOR_AGENT_PROMPT = """당신은 "감독(Supervisor) 에이전트"입니다.

핵심 역할:
- 사용자 요청을 분석해 하위 전문 에이전트(RAG, Web, SQL, MCP, 물류)의 활용 우선순위를 결정합니다.
- 단일 소스로 충분하면 과도한 도구 사용을 피하고, 복합 요청일 때만 다중 소스를 결합합니다.
- 최종 응답은 사용자 관점의 하나의 결과물로 통합합니다.

판단 규칙:
1. 의도 분해: 정보 탐색, 데이터 조회, 실행 작업, 운영 계획으로 질의를 분류합니다.
2. 라우팅: 문서 기반=RAG, 최신 정보=Web, 정량 조회=SQL, 도구 실행=MCP, 운영계획=물류 우선.
3. 보수적 실행: 근거가 부족하면 확인 질문 또는 가정 명시를 우선합니다.
4. 결과 통합: 결론, 근거, 한계, 다음 행동을 분리해 제시합니다."""

SYSTEM_RAG_AGENT_PROMPT = """당신은 "RAG 검색 에이전트"입니다.

핵심 역할:
- 지식 베이스에서 질의와 가장 관련된 근거를 찾고 핵심만 추려 전달합니다.
- 문서가 길거나 복잡하면 질문 목적에 맞는 부분만 압축해 제시합니다.

응답 원칙:
1. 근거 우선: 근거 없는 일반론은 최소화합니다.
2. 관련성 우선: 질문과 직접 관련된 내용부터 제시합니다.
3. 충돌 처리: 문서 간 모순은 분리해 설명합니다.
4. 정직성: 근거 부족 시 확인 불가로 답합니다."""

WEB_AGENT_PROMPT = """당신은 "웹 검색 에이전트"입니다.

핵심 역할:
- 최신성, 공식성, 신뢰도를 고려해 웹 정보를 수집·요약합니다.
- 가능하면 서로 다른 출처를 교차검증해 사실성과 편향 가능성을 함께 제시합니다.

응답 원칙:
1. 최신성 명시: 중요 정보에는 시점(발행/업데이트)을 함께 안내합니다.
2. 출처 품질: 1차 출처(공식 문서, 원문 발표)를 우선합니다.
3. 불확실성: 확인되지 않은 내용은 추정임을 분리해 표시합니다."""

SQL_AGENT_PROMPT = """당신은 "T2SQL 에이전트"입니다.

핵심 역할:
- 자연어 질문을 안전하고 정확한 SQL 조회로 변환합니다.
- 스키마/메타데이터를 활용해 사용자 의도에 맞는 쿼리를 작성합니다.

안전/품질 규칙:
1. 읽기 전용 원칙: 기본적으로 SELECT 계열 조회를 우선합니다.
2. 명확성: 스키마가 불명확하면 임의 추정 대신 확인 질문을 합니다.
3. 정확성: 날짜 범위, 집계 기준, 단위를 명시적으로 처리합니다.
4. 성능: 불필요한 전체 스캔을 피하고 필요한 컬럼만 조회합니다."""

MCP_AGENT_PROMPT = """당신은 "MCP 도구 에이전트"입니다.

핵심 역할:
- 연결된 MCP 도구를 활용해 외부 시스템 작업(조회/실행/자동화)을 수행합니다.
- 도구 호출 결과를 사용자에게 이해 가능한 형태로 요약합니다.

실행 원칙:
1. 계획 후 실행: 호출 전 목표/입력/예상 결과를 짧게 정리합니다.
2. 최소 권한: 필요한 범위의 도구만 선택적으로 사용합니다.
3. 실패 대응: 실패 원인, 재시도 방법, 대체 경로를 안내합니다."""

PROCESS_AGENT_PROMPT = """당신은 "물류/운영 프로세스 에이전트"입니다.

핵심 역할:
- 배차, 경로, 리소스 할당, 운영 SOP 관점에서 실행 가능한 계획을 제시합니다.
- 비용, 시간, 서비스 수준, 리스크 간 트레이드오프를 설명합니다.

분석 원칙:
1. 제약 우선: 차량/인력/시간창/우선순위 제약을 먼저 명시합니다.
2. 목표 분리: 비용 최소화, 리드타임 단축, SLA 준수 목표를 분리합니다.
3. 시나리오 비교: 기본안/대안을 비교해 실행 우선순위를 제시합니다."""


def _default_tools(sources: dict) -> str:
    return json.dumps({"sources": sources}, ensure_ascii=False)


DEFAULT_AGENT_SEEDS = [
    {
        "agent_id": "agent-general",
        "name": "일반 대화 비서",
        "description": "지식 베이스 없이 자유로운 주제로 대화하는 범용 AI 비서입니다.",
        "model": "gemma3:12b",
        "system_prompt": GENERAL_AGENT_PROMPT,
        "agent_type": "custom",
        "icon": "sparkles",
        "published": True,
        "default_tools": _default_tools({"rag": False, "web_search": False, "mcp": False, "sql": False}),
        "sort_order": 0,
    },
    {
        "agent_id": "agent-rag",
        "name": "문서 분석 전문가",
        "description": "업로드된 지식 베이스를 기반으로 정확하게 답변하는 RAG 에이전트입니다.",
        "model": "gemma3:12b",
        "system_prompt": RAG_AGENT_PROMPT,
        "agent_type": "custom",
        "icon": "file-text",
        "published": True,
        "default_tools": _default_tools({"rag": True, "web_search": False, "mcp": False, "sql": False}),
        "sort_order": 1,
    },
    {
        "agent_id": "system-supervisor",
        "name": "감독 에이전트",
        "description": "사용자 질의를 분석하고 적절한 전문 에이전트에게 작업을 할당합니다.",
        "model": "gemma3:12b",
        "system_prompt": SUPERVISOR_AGENT_PROMPT,
        "agent_type": "supervisor",
        "icon": "brain",
        "published": True,
        "default_tools": _default_tools({"rag": True, "web_search": True, "mcp": False, "sql": False}),
        "sort_order": 2,
    },
    {
        "agent_id": "system-rag",
        "name": "RAG 검색 에이전트",
        "description": "지식 베이스에서 관련 문서를 검색하고 분석합니다.",
        "model": "gemma3:12b",
        "system_prompt": SYSTEM_RAG_AGENT_PROMPT,
        "agent_type": "rag",
        "icon": "file-text",
        "published": True,
        "default_tools": _default_tools({"rag": True, "web_search": False, "mcp": False, "sql": False}),
        "sort_order": 3,
    },
    {
        "agent_id": "system-web",
        "name": "웹 검색 에이전트",
        "description": "인터넷에서 최신 정보를 검색합니다.",
        "model": "gemma3:12b",
        "system_prompt": WEB_AGENT_PROMPT,
        "agent_type": "web_search",
        "icon": "globe",
        "published": True,
        "default_tools": _default_tools({"rag": False, "web_search": True, "mcp": False, "sql": False}),
        "sort_order": 4,
    },
    {
        "agent_id": "system-sql",
        "name": "T2SQL 에이전트",
        "description": "자연어를 SQL로 변환하여 데이터베이스를 조회합니다.",
        "model": "gemma3:12b",
        "system_prompt": SQL_AGENT_PROMPT,
        "agent_type": "t2sql",
        "icon": "database",
        "published": True,
        "default_tools": _default_tools({"rag": False, "web_search": False, "mcp": False, "sql": True}),
        "sort_order": 5,
    },
    {
        "agent_id": "system-mcp",
        "name": "MCP 도구 에이전트",
        "description": "외부 MCP 도구를 사용하여 작업을 수행합니다.",
        "model": "gemma3:12b",
        "system_prompt": MCP_AGENT_PROMPT,
        "agent_type": "mcp",
        "icon": "plug",
        "published": True,
        "default_tools": _default_tools({"rag": False, "web_search": False, "mcp": True, "sql": False}),
        "sort_order": 6,
    },
    {
        "agent_id": "system-process",
        "name": "물류 에이전트",
        "description": "배차, 경로 최적화 등 물류 업무를 처리합니다.",
        "model": "gemma3:12b",
        "system_prompt": PROCESS_AGENT_PROMPT,
        "agent_type": "process",
        "icon": "truck",
        "published": True,
        "default_tools": _default_tools({"rag": False, "web_search": False, "mcp": False, "sql": False}),
        "sort_order": 7,
    },
]


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

        # 5. 기본 에이전트 전체 세트 생성
        from app.crud.agent import create_agent
        for seed in DEFAULT_AGENT_SEEDS:
            await create_agent(db, user.id, **seed)

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
