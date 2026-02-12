"""
RAG AI 시스템 종합 기능 테스트
모든 주요 기능을 체계적으로 검증합니다.
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime


class Colors:
    """터미널 색상"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    END = '\033[0m'


def print_header(text):
    """섹션 헤더 출력"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'=' * 70}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text.center(70)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'=' * 70}{Colors.END}\n")


def print_test(name, status, message=""):
    """테스트 결과 출력"""
    if status == "pass":
        symbol = f"{Colors.GREEN}[OK]{Colors.END}"
        status_text = f"{Colors.GREEN}PASS{Colors.END}"
    elif status == "fail":
        symbol = f"{Colors.RED}[X]{Colors.END}"
        status_text = f"{Colors.RED}FAIL{Colors.END}"
    elif status == "warn":
        symbol = f"{Colors.YELLOW}[!]{Colors.END}"
        status_text = f"{Colors.YELLOW}WARN{Colors.END}"
    elif status == "skip":
        symbol = f"{Colors.BLUE}[-]{Colors.END}"
        status_text = f"{Colors.BLUE}SKIP{Colors.END}"
    else:
        symbol = "[*]"
        status_text = "INFO"

    print(f"{symbol} {name:<43} [{status_text}] {message}")


class TestResults:
    """테스트 결과 집계"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warned = 0
        self.skipped = 0
        self.total = 0
        self.details = []

    def add(self, name, status, message=""):
        self.total += 1
        if status == "pass":
            self.passed += 1
        elif status == "fail":
            self.failed += 1
        elif status == "warn":
            self.warned += 1
        elif status == "skip":
            self.skipped += 1
        self.details.append((name, status, message))

    def print_summary(self):
        print_header("테스트 결과 요약")
        print(f"{Colors.BOLD}총 테스트:{Colors.END} {self.total}")
        print(f"{Colors.GREEN}성공:{Colors.END} {self.passed}")
        print(f"{Colors.RED}실패:{Colors.END} {self.failed}")
        print(f"{Colors.YELLOW}경고:{Colors.END} {self.warned}")
        print(f"{Colors.BLUE}건너뜀:{Colors.END} {self.skipped}")

        if self.failed > 0:
            print(f"\n{Colors.RED}{Colors.BOLD}[!] WARNING: Some tests failed! Check details above.{Colors.END}")
        elif self.warned > 0:
            print(f"\n{Colors.YELLOW}{Colors.BOLD}[!] NOTICE: Some warnings found.{Colors.END}")
        else:
            print(f"\n{Colors.GREEN}{Colors.BOLD}[OK] All tests passed!{Colors.END}")


async def test_configuration(results: TestResults):
    """1. 설정 파일 및 환경 변수 테스트"""
    print_header("1. 설정 및 환경 변수")

    try:
        from app.core.config import settings
        print_test("Config 로드", "pass", f"환경: {settings.ENVIRONMENT}")
        results.add("Config 로드", "pass")

        # 필수 설정 확인
        if len(settings.SECRET_KEY) >= 32:
            print_test("SECRET_KEY", "pass", "유효")
            results.add("SECRET_KEY", "pass")
        else:
            print_test("SECRET_KEY", "fail", "너무 짧음")
            results.add("SECRET_KEY", "fail")

        # 데이터베이스 URL
        if settings.DATABASE_URL:
            print_test("DATABASE_URL", "pass", "설정됨")
            results.add("DATABASE_URL", "pass")
        else:
            print_test("DATABASE_URL", "fail", "미설정")
            results.add("DATABASE_URL", "fail")

        # VLM 설정
        print_test("ENABLE_CAPTIONING", "pass" if settings.ENABLE_CAPTIONING else "warn", str(settings.ENABLE_CAPTIONING))
        results.add("ENABLE_CAPTIONING", "pass" if settings.ENABLE_CAPTIONING else "warn")

        print_test("ENABLE_OCR", "pass" if settings.ENABLE_OCR else "warn", str(settings.ENABLE_OCR))
        results.add("ENABLE_OCR", "pass" if settings.ENABLE_OCR else "warn")

        print_test("ENABLE_THUMBNAIL", "pass" if settings.ENABLE_THUMBNAIL else "warn", str(settings.ENABLE_THUMBNAIL))
        results.add("ENABLE_THUMBNAIL", "pass" if settings.ENABLE_THUMBNAIL else "warn")

        # 이미지 저장 디렉토리
        image_dir = Path(settings.IMAGE_STORAGE_DIR)
        if image_dir.exists():
            print_test("IMAGE_STORAGE_DIR", "pass", str(image_dir))
            results.add("IMAGE_STORAGE_DIR", "pass")
        else:
            print_test("IMAGE_STORAGE_DIR", "warn", "폴더 없음 (자동 생성됨)")
            results.add("IMAGE_STORAGE_DIR", "warn")

    except Exception as e:
        print_test("Config 로드", "fail", str(e))
        results.add("Config 로드", "fail", str(e))


async def test_database_connections(results: TestResults):
    """2. 데이터베이스 연결 테스트"""
    print_header("2. 데이터베이스 연결")

    # PostgreSQL
    try:
        from app.db.session import engine
        async with engine.begin() as conn:
            await conn.execute("SELECT 1")
        print_test("PostgreSQL", "pass", "연결 성공")
        results.add("PostgreSQL", "pass")
    except Exception as e:
        print_test("PostgreSQL", "fail", str(e)[:50])
        results.add("PostgreSQL", "fail")

    # Qdrant
    try:
        from qdrant_client import QdrantClient
        from app.core.config import settings
        client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
        collections = client.get_collections()
        print_test("Qdrant", "pass", f"{len(collections.collections)}개 컬렉션")
        results.add("Qdrant", "pass")
    except Exception as e:
        print_test("Qdrant", "fail", str(e)[:50])
        results.add("Qdrant", "fail")

    # Redis
    try:
        from app.services.cache_service import get_cache_service
        cache = get_cache_service()
        connected = await cache.connect()
        if connected:
            print_test("Redis", "pass", "연결 성공")
            results.add("Redis", "pass")
        else:
            print_test("Redis", "warn", "In-memory fallback")
            results.add("Redis", "warn")
    except Exception as e:
        print_test("Redis", "fail", str(e)[:50])
        results.add("Redis", "fail")

    # Neo4j
    try:
        from neo4j import AsyncGraphDatabase
        from app.core.config import settings
        driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URL,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
        )
        async with driver.session() as session:
            result = await session.run("RETURN 1")
            await result.single()
        await driver.close()
        print_test("Neo4j", "pass", "연결 성공")
        results.add("Neo4j", "pass")
    except Exception as e:
        print_test("Neo4j", "fail", str(e)[:50])
        results.add("Neo4j", "fail")


async def test_llm_services(results: TestResults):
    """3. LLM 및 임베딩 서비스 테스트"""
    print_header("3. LLM 및 임베딩 서비스")

    # Ollama
    try:
        from app.core.config import settings
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                print_test("Ollama", "pass", f"{len(models)}개 모델")
                results.add("Ollama", "pass")
            else:
                print_test("Ollama", "fail", f"HTTP {response.status_code}")
                results.add("Ollama", "fail")
    except Exception as e:
        print_test("Ollama", "fail", str(e)[:50])
        results.add("Ollama", "fail")

    # BGE 임베딩
    try:
        from app.services.embeddings import get_embeddings
        embeddings = get_embeddings()
        test_vec = embeddings.embed_query("test")
        print_test("BGE Embeddings", "pass", f"{len(test_vec)}-dim on {embeddings.model_kwargs.get('device', 'cpu')}")
        results.add("BGE Embeddings", "pass")
    except Exception as e:
        print_test("BGE Embeddings", "fail", str(e)[:50])
        results.add("BGE Embeddings", "fail")


async def test_vlm_services(results: TestResults):
    """4. VLM (Vision-Language Model) 서비스 테스트"""
    print_header("4. VLM 서비스 (이미지 AI)")

    # CLIP
    try:
        from app.services.clip_embeddings import get_clip_embeddings
        clip = get_clip_embeddings()
        test_vec = clip.embed_text_for_cross_modal("a cat")
        print_test("CLIP Embeddings", "pass", f"{len(test_vec)}-dim on {clip.device}")
        results.add("CLIP Embeddings", "pass")
    except Exception as e:
        print_test("CLIP Embeddings", "fail", str(e)[:50])
        results.add("CLIP Embeddings", "fail")

    # BLIP Captioning
    try:
        from app.services.image_captioning import get_image_captioning_service
        captioner = get_image_captioning_service()
        captioner._load_model()
        if captioner._model is not None:
            print_test("BLIP Captioning", "pass", f"on {captioner._device}")
            results.add("BLIP Captioning", "pass")
        else:
            print_test("BLIP Captioning", "warn", "모델 미로드 (첫 사용 시 로드)")
            results.add("BLIP Captioning", "warn")
    except Exception as e:
        print_test("BLIP Captioning", "fail", str(e)[:50])
        results.add("BLIP Captioning", "fail")

    # EasyOCR
    try:
        from app.services.image_ocr import get_image_ocr_service
        ocr = get_image_ocr_service()
        ocr._load_reader()
        if ocr._reader is not None:
            print_test("EasyOCR", "pass", "ko, en 지원")
            results.add("EasyOCR", "pass")
        else:
            print_test("EasyOCR", "warn", "Reader 미로드 (첫 사용 시 로드)")
            results.add("EasyOCR", "warn")
    except Exception as e:
        print_test("EasyOCR", "fail", str(e)[:50])
        results.add("EasyOCR", "fail")

    # Thumbnail Generator
    try:
        from app.services.thumbnail_generator import get_thumbnail_generator
        thumb_gen = get_thumbnail_generator()
        print_test("Thumbnail Generator", "pass", "초기화 완료")
        results.add("Thumbnail Generator", "pass")
    except Exception as e:
        print_test("Thumbnail Generator", "fail", str(e)[:50])
        results.add("Thumbnail Generator", "fail")


async def test_rag_pipeline(results: TestResults):
    """5. RAG 파이프라인 테스트"""
    print_header("5. RAG 파이프라인")

    # Vector Store Service
    try:
        from app.services.vector_store import get_vector_store_service
        vector_service = get_vector_store_service()
        print_test("Vector Store Service", "pass", "초기화 완료")
        results.add("Vector Store Service", "pass")
    except Exception as e:
        print_test("Vector Store Service", "fail", str(e)[:50])
        results.add("Vector Store Service", "fail")

    # Graph Store Service
    try:
        from app.services.graph_store import get_graph_store_service
        graph_service = get_graph_store_service()
        print_test("Graph Store Service", "pass", "초기화 완료")
        results.add("Graph Store Service", "pass")
    except Exception as e:
        print_test("Graph Store Service", "fail", str(e)[:50])
        results.add("Graph Store Service", "fail")

    # Ingestion Service
    try:
        from app.services.ingestion import get_ingestion_service
        ingestion = get_ingestion_service()
        print_test("Ingestion Service", "pass", "초기화 완료")
        results.add("Ingestion Service", "pass")
    except Exception as e:
        print_test("Ingestion Service", "fail", str(e)[:50])
        results.add("Ingestion Service", "fail")

    # RAG Service
    try:
        from app.services.rag_service import get_rag_service
        rag = get_rag_service()
        print_test("RAG Service", "pass", "초기화 완료")
        results.add("RAG Service", "pass")
    except Exception as e:
        print_test("RAG Service", "fail", str(e)[:50])
        results.add("RAG Service", "fail")


async def test_retriever_factory(results: TestResults):
    """6. Retriever Factory 및 VDB 라우팅 테스트"""
    print_header("6. Retriever Factory (Hybrid VDB)")

    try:
        from app.services.retriever_factory import get_retriever_factory
        factory = get_retriever_factory()
        print_test("Retriever Factory", "pass", "초기화 완료")
        results.add("Retriever Factory", "pass")

        # Qdrant Store
        try:
            from app.services.vdb.qdrant_store import QdrantStore
            print_test("Qdrant Store", "pass", "모듈 로드 성공")
            results.add("Qdrant Store", "pass")
        except Exception as e:
            print_test("Qdrant Store", "fail", str(e)[:50])
            results.add("Qdrant Store", "fail")

        # Pinecone Store (optional)
        try:
            from app.services.vdb.pinecone_store import PineconeStore
            print_test("Pinecone Store", "pass", "모듈 로드 성공 (선택)")
            results.add("Pinecone Store", "pass")
        except ImportError:
            print_test("Pinecone Store", "skip", "미설치 (선택 사항)")
            results.add("Pinecone Store", "skip")
        except Exception as e:
            print_test("Pinecone Store", "warn", str(e)[:50])
            results.add("Pinecone Store", "warn")

    except Exception as e:
        print_test("Retriever Factory", "fail", str(e)[:50])
        results.add("Retriever Factory", "fail")


async def test_mcp_tools(results: TestResults):
    """7. MCP (Model Context Protocol) 도구 테스트"""
    print_header("7. MCP 서버 및 도구")

    try:
        from app.services.tool_registry import ToolRegistry
        print_test("Tool Registry", "pass", "초기화 완료")
        results.add("Tool Registry", "pass")

        # MCP 패키지 확인
        try:
            import mcp
            print_test("MCP Package", "pass", f"v{mcp.__version__}")
            results.add("MCP Package", "pass")
        except ImportError:
            print_test("MCP Package", "fail", "미설치")
            results.add("MCP Package", "fail")

    except Exception as e:
        print_test("Tool Registry", "fail", str(e)[:50])
        results.add("Tool Registry", "fail")


async def test_encryption(results: TestResults):
    """8. 암호화 서비스 테스트"""
    print_header("8. 암호화 및 보안")

    try:
        from app.services.encryption_service import get_encryption_service
        encryption = get_encryption_service()

        # 암호화/복호화 테스트
        test_data = "sensitive_api_key_12345"
        encrypted = encryption.encrypt(test_data)
        decrypted = encryption.decrypt(encrypted)

        if decrypted == test_data:
            print_test("Fernet Encryption", "pass", "암호화/복호화 정상")
            results.add("Fernet Encryption", "pass")
        else:
            print_test("Fernet Encryption", "fail", "복호화 불일치")
            results.add("Fernet Encryption", "fail")

    except Exception as e:
        print_test("Fernet Encryption", "fail", str(e)[:50])
        results.add("Fernet Encryption", "fail")


async def test_file_structure(results: TestResults):
    """9. 파일 구조 및 경로 테스트"""
    print_header("9. 파일 구조 및 경로")

    from app.core.config import settings

    # 이미지 저장 디렉토리
    image_dir = Path(settings.IMAGE_STORAGE_DIR)
    if image_dir.exists():
        kb_dirs = list(image_dir.glob("kb_*"))
        print_test("이미지 저장 폴더", "pass", f"{len(kb_dirs)}개 KB")
        results.add("이미지 저장 폴더", "pass")

        # 썸네일 파일 확인
        total_images = sum(len(list(kb.glob("*.png")) + list(kb.glob("*.jpg"))) for kb in kb_dirs)
        total_thumbs = sum(len(list(kb.glob("*_thumb.png"))) for kb in kb_dirs)
        print_test("저장된 이미지", "pass", f"{total_images}개 (썸네일 {total_thumbs}개)")
        results.add("저장된 이미지", "pass")
    else:
        print_test("이미지 저장 폴더", "warn", "폴더 없음 (자동 생성됨)")
        results.add("이미지 저장 폴더", "warn")

    # 마이그레이션 스크립트
    migrate_script = Path("backend/migrate_image_paths.py")
    if migrate_script.exists():
        print_test("마이그레이션 스크립트", "pass", "존재")
        results.add("마이그레이션 스크립트", "pass")
    else:
        print_test("마이그레이션 스크립트", "warn", "없음")
        results.add("마이그레이션 스크립트", "warn")


async def test_api_endpoints(results: TestResults):
    """10. API 엔드포인트 테스트"""
    print_header("10. API 엔드포인트")

    try:
        from app.api.api import api_router
        routes = []
        for route in api_router.routes:
            if hasattr(route, 'path'):
                routes.append(route.path)

        print_test("API Router", "pass", f"{len(routes)}개 엔드포인트")
        results.add("API Router", "pass")

        # 주요 엔드포인트 확인
        critical_endpoints = [
            "/auth/login",
            "/auth/register",
            "/chat/stream",
            "/knowledge/upload",
            "/knowledge/bases",
        ]

        for endpoint in critical_endpoints:
            if any(endpoint in route for route in routes):
                print_test(f"  └─ {endpoint}", "pass", "등록됨")
            else:
                print_test(f"  └─ {endpoint}", "warn", "미등록")

    except Exception as e:
        print_test("API Router", "fail", str(e)[:50])
        results.add("API Router", "fail")


async def main():
    """메인 테스트 실행"""
    print(f"\n{Colors.BOLD}{Colors.MAGENTA}")
    print("=" * 70)
    print("RAG AI System - Comprehensive Test Suite".center(70))
    print("=" * 70)
    print(f"{Colors.END}")
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    results = TestResults()

    try:
        await test_configuration(results)
        await test_database_connections(results)
        await test_llm_services(results)
        await test_vlm_services(results)
        await test_rag_pipeline(results)
        await test_retriever_factory(results)
        await test_mcp_tools(results)
        await test_encryption(results)
        await test_file_structure(results)
        await test_api_endpoints(results)

    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}테스트 중단됨{Colors.END}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{Colors.RED}치명적 오류: {e}{Colors.END}")
        sys.exit(1)

    results.print_summary()
    print(f"\n종료 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # 실패 시 exit code 1 반환
    if results.failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
