"""
문서 수집 서비스 (Ingestion Pipeline)

전체 문서 처리 파이프라인:
1. 파일 업로드 및 안전한 저장
2. 문서 파싱 (Docling → PyPDF 폴백)
3. 이미지 추출 및 저장
4. 텍스트 청킹 (고정 크기 또는 시맨틱)
5. 임베딩 생성 (BGE-m3 텍스트 + CLIP 멀티모달)
6. 벡터 DB 저장 (Qdrant: dense + sparse + clip)
7. 그래프 DB 저장 (Neo4j: 엔티티 관계)
8. 이미지 인덱싱 (CLIP + 캡셔닝 + OCR)
"""
import os
import logging
import tempfile
import uuid
import re
import asyncio
from datetime import datetime, timezone
from typing import Optional, Tuple, List
from functools import lru_cache
from pathlib import Path

import aiofiles
from fastapi import UploadFile
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_experimental.graph_transformers import LLMGraphTransformer
from langchain_ollama import ChatOllama
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader

from app.services.vector_store import get_vector_store_service
from app.services.graph_store import get_graph_store_service
from app.core.config import settings

logger = logging.getLogger(__name__)


class IngestionError(Exception):
    """문서 수집 관련 에러"""
    pass


class IngestionService:
    """문서 수집 및 처리 서비스 (싱글톤)"""

    _instance: Optional["IngestionService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if IngestionService._initialized:
            return

        try:
            self.vector_service = get_vector_store_service()
            self.graph_service = get_graph_store_service()

            # 크로스 플랫폼 임시 디렉토리 사용
            self.upload_dir = Path(tempfile.gettempdir()) / "rag_uploads"
            self.upload_dir.mkdir(parents=True, exist_ok=True)

            # 이미지 저장 디렉토리
            self.image_storage_dir = Path(settings.IMAGE_STORAGE_DIR)
            self.image_storage_dir.mkdir(parents=True, exist_ok=True)

            # Ollama 환경 설정
            os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL

            # Docling 초기화 (지연 로딩)
            self._converter = None

            # 디바이스 설정
            self._device = self._get_device()

            # 임베딩 모델 (지연 로딩)
            self._embeddings = None

            # CLIP 임베딩 (지연 로딩)
            self._clip_embeddings = None

            # 이미지 캡셔닝 (지연 로딩)
            self._image_captioning = None

            # 이미지 OCR (지연 로딩)
            self._image_ocr = None

            # LLM (지연 로딩)
            self._llm = None
            self._llm_transformer = None

            IngestionService._initialized = True
            logger.info(f"[수집] 초기화 완료 - 디바이스: {self._device}, 이미지 저장: {self.image_storage_dir}")
        except Exception as e:
            logger.error(f"[수집] 초기화 실패: {e}", exc_info=True)
            IngestionService._initialized = False
            raise

    @staticmethod
    def _get_device() -> str:
        """GPU 여유 메모리 확인 후 디바이스 자동 결정"""
        from app.core.device import get_device
        return get_device(model_name=settings.EMBEDDING_MODEL)
        return configured

    @property
    def converter(self):
        """Docling DocumentConverter (지연 로딩) - 수식 인식 포함"""
        if self._converter is None:
            try:
                from docling.document_converter import DocumentConverter, PdfFormatOption
                from docling.datamodel.pipeline_options import PdfPipelineOptions
                from docling.datamodel.base_models import InputFormat

                pipeline_options = PdfPipelineOptions()
                pipeline_options.do_ocr = True
                pipeline_options.do_table_structure = True
                pipeline_options.table_structure_options.do_cell_matching = True

                # 수식 인식 활성화 (LaTeX 변환)
                try:
                    pipeline_options.do_formula_enrichment = True
                    logger.info("[수집] Docling 수식 인식(formula enrichment) 활성화")
                except Exception as e:
                    logger.warning(f"[수집] 수식 인식 활성화 실패 (무시): {e}")

                self._converter = DocumentConverter(
                    format_options={
                        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                        InputFormat.IMAGE: PdfFormatOption(pipeline_options=pipeline_options)
                    }
                )
            except ImportError:
                logger.warning("[수집] Docling 사용 불가 - PyPDF 폴백만 사용")
                self._converter = None
        return self._converter

    @property
    def embeddings(self):
        """임베딩 모델 (지연 로딩)"""
        if self._embeddings is None:
            self._embeddings = HuggingFaceEmbeddings(
                model_name=settings.EMBEDDING_MODEL,
                model_kwargs={'device': self._device, 'trust_remote_code': True},
                encode_kwargs={'normalize_embeddings': True}
            )
        return self._embeddings

    @property
    def clip_embeddings(self):
        """CLIP 임베딩 모델 (지연 로딩)"""
        if self._clip_embeddings is None:
            from app.services.clip_embeddings import get_clip_embeddings
            self._clip_embeddings = get_clip_embeddings()
        return self._clip_embeddings

    @property
    def image_captioning(self):
        """이미지 캡셔닝 서비스 (지연 로딩)"""
        if self._image_captioning is None:
            from app.services.image_captioning import get_image_captioning_service
            self._image_captioning = get_image_captioning_service()
        return self._image_captioning

    @property
    def image_ocr(self):
        """이미지 OCR 서비스 (지연 로딩)"""
        if self._image_ocr is None:
            from app.services.image_ocr import get_image_ocr_service
            self._image_ocr = get_image_ocr_service()
        return self._image_ocr

    def _detect_graph_llm_model(self) -> str:
        """
        그래프 추출에 사용할 LLM 모델 결정

        Tool calling을 지원하는 설치된 모델을 자동 감지합니다.
        설정된 LLM_MODEL이 없거나 tool calling 미지원이면 대체 모델 사용.
        """
        # 기본 설정 모델
        configured = settings.LLM_MODEL

        # Tool calling 지원하는 모델 우선순위 (Ollama)
        # 설치 여부를 실제 확인하기보다 설정된 모델을 먼저 시도
        tool_calling_models = [
            configured,
            "gemma3:27b", "gemma3:12b",
            "qwen2.5:14b", "qwen2.5:7b",
            "llama3.1:8b", "llama3.1",
            "mistral:7b",
        ]

        # Ollama에서 실제 설치된 모델 확인
        try:
            import httpx
            resp = httpx.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=5)
            if resp.status_code == 200:
                installed = {m["name"] for m in resp.json().get("models", [])}
                # tool calling 미지원 모델 제외
                no_tool_calling = {"llava", "bge-m3", "nomic-embed"}

                for model in tool_calling_models:
                    # 정확 매치 또는 prefix 매치
                    if model in installed or any(m.startswith(model.split(":")[0]) for m in installed):
                        base = model.split(":")[0]
                        if not any(ntc in base for ntc in no_tool_calling):
                            logger.info(f"[수집] 그래프 LLM 선택: {model}")
                            return model

                # 설치된 모델 중 tool calling 가능한 아무 모델
                for m in installed:
                    base = m.split(":")[0]
                    if not any(ntc in base for ntc in no_tool_calling):
                        logger.info(f"[수집] 그래프 LLM 폴백: {m}")
                        return m

        except Exception as e:
            logger.warning(f"[수집] Ollama 모델 목록 조회 실패: {e}")

        return configured

    @property
    def llm_transformer(self):
        """LLM Graph Transformer (지연 로딩) - Tool Calling 미지원 모델 대응"""
        if self._llm_transformer is None:
            # 그래프 추출에 적합한 모델 선택
            graph_model = self._detect_graph_llm_model()

            if self._llm is None or graph_model != settings.LLM_MODEL:
                self._llm = ChatOllama(
                    model=graph_model,
                    temperature=settings.LLM_TEMPERATURE
                )

            try:
                self._llm_transformer = LLMGraphTransformer(
                    llm=self._llm,
                    allowed_nodes=["Entity", "Concept", "Person", "Place", "Event"],
                    allowed_relationships=["RELATION", "INCLUDES", "INVOLVES", "CAUSES"],
                    strict_mode=False,
                )
                logger.info(f"[수집] LLMGraphTransformer 초기화 (model={graph_model})")
            except Exception as e:
                logger.warning(f"[수집] LLMGraphTransformer 초기화 실패 ({graph_model}): {e}")
                # prompt-based 폴백 (tool calling 미지원 모델용)
                try:
                    self._llm_transformer = LLMGraphTransformer(
                        llm=self._llm,
                        allowed_nodes=["Entity", "Concept", "Person", "Place", "Event"],
                        allowed_relationships=["RELATION", "INCLUDES", "INVOLVES", "CAUSES"],
                        strict_mode=False,
                        node_properties=False,
                        relationship_properties=False,
                    )
                    logger.info(f"[수집] LLMGraphTransformer 폴백 초기화 (simplified, model={graph_model})")
                except Exception as e2:
                    logger.error(f"[수집] LLMGraphTransformer 완전 실패: {e2}")
                    self._llm_transformer = None

        return self._llm_transformer

    def _get_safe_filename(self, original_filename: str) -> str:
        """경로 탐색 공격 방지를 위한 안전한 파일명 생성"""
        ext = ""
        if original_filename and "." in original_filename:
            ext = Path(original_filename).suffix.lower()
            # 허용된 확장자만 사용
            if ext not in settings.allowed_extensions_list:
                ext = ""
        return f"{uuid.uuid4()}{ext}"

    # 수학 기호 유니코드 범위
    _MATH_SYMBOLS = (
        '\u2200-\u22FF'   # Mathematical Operators (∀∁∂∃...≤≥≠≈)
        '\u2A00-\u2AFF'   # Supplemental Mathematical Operators
        '\u27C0-\u27EF'   # Miscellaneous Mathematical Symbols-A
        '\u2980-\u29FF'   # Miscellaneous Mathematical Symbols-B
        '\u00B1'          # ± (plus-minus)
        '\u00D7'          # × (multiplication)
        '\u00F7'          # ÷ (division)
    )

    # 수식 플레이스홀더
    _FORMULA_PLACEHOLDER = "[수식]"

    # 유니코드 수학 기호 → ASCII 정규화 매핑
    _MATH_NORMALIZATIONS = {
        '\u2264': '<=', '\u2265': '>=', '\u2260': '!=', '\u2248': '~=',
        '\u221E': 'inf', '\u2211': 'sum', '\u220F': 'prod', '\u222B': 'int',
        '\u2202': 'd', '\u00B1': '+/-', '\u00D7': '*', '\u00F7': '/',
    }

    @classmethod
    def clean_markdown(cls, text: str) -> str:
        """
        마크다운 텍스트 정리 및 수식 클린업

        Docling이 수식을 파싱할 때 발생하는 문제:
        - 수학 기호가 중복 출력 (≤≤, ≥≥ 등)
        - 수식이 의미없는 기호 나열로 변환
        - LaTeX가 깨져서 출력

        수식 enrichment가 활성화되면 $...$ 형식의 LaTeX는 보존합니다.
        """
        # ===== Phase 1: LaTeX 수식 블록 보존 =====
        # $$ ... $$ 또는 $ ... $ 내부의 LaTeX는 보존
        # 보존할 LaTeX 블록을 임시 치환
        latex_blocks = []

        def _save_latex(match):
            latex_blocks.append(match.group(0))
            return f"__LATEX_BLOCK_{len(latex_blocks) - 1}__"

        # $$...$$ 블록 보존
        text = re.sub(r'\$\$[^$]+?\$\$', _save_latex, text, flags=re.DOTALL)
        # $...$ 인라인 수식 보존 (유효한 LaTeX만 - 문자/숫자 포함)
        text = re.sub(r'\$[^$\n]{2,}?\$', _save_latex, text)

        # ===== Phase 1.5: LaTeX 블록 외부의 유니코드 수학 기호를 ASCII로 정규화 =====
        # 이 시점에서 LaTeX 블록은 __LATEX_BLOCK_N__ 플레이스홀더로 치환된 상태
        for sym, ascii_repr in cls._MATH_NORMALIZATIONS.items():
            text = text.replace(sym, ascii_repr)

        # ===== Phase 2: 깨진 수식 패턴 정리 =====
        # 2a. 동일한 수학 기호가 연속 반복되는 패턴 (≤≤ → ≤, ∫∫∫ → ∫ 등)
        text = re.sub(
            rf'([{cls._MATH_SYMBOLS}])\1+',
            r'\1', text
        )

        # 2b. 빈 수식 블록 제거 ($$ $$, $ $)
        text = re.sub(r'\$\$\s*\$\$', '', text)
        text = re.sub(r'\$\s*\$', '', text)

        # 2c. 수학 기호만 공백으로 나열된 패턴 정리 (3개 이상 연속)
        #     예: "  ≤  ≤  ≤  " → [수식] 플레이스홀더
        text = re.sub(
            rf'(\s*[{cls._MATH_SYMBOLS}]\s*){{3,}}',
            f' {cls._FORMULA_PLACEHOLDER} ',
            text
        )

        # 2d. 줄 전체가 수학 기호/괄호/공백만으로 구성된 경우 (의미없는 수식 잔여물)
        #     수학 기호 3개 이상인 줄만 플레이스홀더로 대체 (1-2개는 보존)
        def _replace_formula_line(match):
            line = match.group(0)
            math_count = len(re.findall(rf'[{cls._MATH_SYMBOLS}]', line))
            if math_count >= 3:
                return cls._FORMULA_PLACEHOLDER
            return line  # 1-2개는 보존

        text = re.sub(
            rf'^[{cls._MATH_SYMBOLS}\s\(\)\[\]{{}}\|_^]+$',
            _replace_formula_line,
            text,
            flags=re.MULTILINE
        )

        # 2e. Docling 특유의 깨진 출력: 공백+기호 반복 패턴 (2개 이상만 대체, 단일 기호 보존)
        #     예: "   ≤≤ \n  ≤≤ "
        text = re.sub(
            rf'^\s*[{cls._MATH_SYMBOLS}]{{2,3}}\s*$',
            cls._FORMULA_PLACEHOLDER,
            text,
            flags=re.MULTILINE
        )

        # ===== Phase 3: LaTeX 블록 복원 =====
        for i, block in enumerate(latex_blocks):
            text = text.replace(f"__LATEX_BLOCK_{i}__", block)

        # ===== Phase 4: 마크다운 라인 정리 =====
        lines = []
        prev_empty = False
        for line in text.split('\n'):
            stripped = line.strip()

            # 빈 줄 연속 방지 (최대 1개)
            if not stripped:
                if not prev_empty:
                    lines.append('')
                    prev_empty = True
                continue
            prev_empty = False

            # 테이블 구분선 제거
            if re.match(r'^[|\-+\s]+$', stripped):
                continue

            lines.append(line)

        # 연속된 [수식] 플레이스홀더를 하나로 통합
        result = '\n'.join(lines)
        result = re.sub(
            rf'({re.escape(cls._FORMULA_PLACEHOLDER)}\s*)+',
            f'{cls._FORMULA_PLACEHOLDER} ',
            result
        )
        return result

    async def save_file(self, file: UploadFile, kb_id: str, user_id: int) -> Tuple[str, str]:
        """
        파일을 안전하게 저장하고 파일 경로와 원본 파일명을 반환

        경로 탐색 공격 방지를 위해 UUID 기반 파일명 사용
        비동기 파일 I/O로 대용량 파일도 효율적으로 처리
        """
        original_filename = file.filename or "unknown"
        safe_filename = self._get_safe_filename(original_filename)
        file_path = self.upload_dir / safe_filename

        try:
            # 비동기 파일 쓰기
            async with aiofiles.open(file_path, "wb") as buffer:
                # 청크 단위로 읽어서 쓰기 (메모리 효율성)
                chunk_size = 1024 * 1024  # 1MB
                while True:
                    chunk = await file.read(chunk_size)
                    if not chunk:
                        break
                    await buffer.write(chunk)

            file_size_mb = file_path.stat().st_size / (1024 * 1024)
            logger.info(f"[수집] 파일 저장 완료: {original_filename} ({file_size_mb:.2f}MB) -> {safe_filename}")
            return str(file_path), original_filename

        except Exception as e:
            logger.error(f"[수집] 파일 저장 실패: {e}")
            # 실패 시 파일 정리
            if file_path.exists():
                file_path.unlink()
            raise IngestionError(f"파일 저장 실패: {str(e)}")

    async def _update_file_record(self, file_record_id: Optional[int], status: str,
                                    chunk_count: int = 0, error_message: str = None):
        """KnowledgeFile 레코드 상태 업데이트 (독립 DB 세션 사용)"""
        if not file_record_id:
            return
        try:
            from app.db.session import AsyncSessionLocal
            from app.crud.knowledge_base import update_file_status
            async with AsyncSessionLocal() as db:
                await update_file_status(db, file_record_id, status, chunk_count, error_message)
                logger.info(f"[수집] 파일 레코드 업데이트: id={file_record_id}, status={status}")
        except Exception as e:
            logger.warning(f"[수집] 파일 레코드 업데이트 실패: {e}")

    async def process_file_background(
        self,
        file_path: str,
        original_filename: str,
        kb_id: str,
        user_id: int,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        chunking_method: str = "fixed",
        semantic_threshold: float = 0.75,
        qdrant_client=None,
        file_record_id: Optional[int] = None,
        vision_model: Optional[str] = None,
    ):
        """
        백그라운드에서 파일을 처리 (비동기 파이프라인)

        처리 단계:
        1. 파일 타입 확인 (문서 vs 이미지)
        2. 문서: 파싱 → 청킹 → 임베딩 → 인덱싱
        3. 이미지: 저장 → CLIP 임베딩 → 인덱싱
        4. 임시 파일 정리
        """
        logger.info(f"[수집] 백그라운드 처리 시작: {original_filename} (청킹={chunking_method}, 임계값={semantic_threshold})")

        # 설정값 또는 기본값 사용
        chunk_size = chunk_size or settings.RAG_CHUNK_SIZE
        chunk_overlap = chunk_overlap or settings.RAG_CHUNK_OVERLAP

        base_metadata = {
            "source": original_filename,
            "kb_id": kb_id,
            "user_id": user_id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }

        file_path_obj = Path(file_path)

        final_splits = []  # 청크 수 추적용

        try:
            # 파일 존재 확인
            if not file_path_obj.exists():
                logger.error(f"[수집] 파일 없음: {file_path}")
                await self._update_file_record(file_record_id, "error", error_message="파일을 찾을 수 없습니다")
                return

            # 파일 확장자 확인
            ext = file_path_obj.suffix.lower()
            is_image = ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]

            if is_image:
                # 이미지 파일 직접 처리
                logger.info(f"[수집] 이미지 파일 처리 중: {original_filename}")
                saved_image_path = await self._process_image_file(file_path, kb_id, original_filename)

                if saved_image_path:
                    # CLIP 임베딩 생성 및 Qdrant 저장
                    await self._index_images(
                        [saved_image_path],
                        base_metadata,
                        kb_id,
                        qdrant_client=qdrant_client,
                        vision_model=vision_model,
                    )
                    logger.info(f"[수집] 이미지 인덱싱 완료: {original_filename}")
                else:
                    logger.warning(f"[수집] 이미지 처리 실패: {original_filename}")

            else:
                # 문서 파싱 및 청킹 (이미지 추출 포함)
                final_splits, extracted_images = await self._parse_and_chunk(
                    file_path,
                    chunk_size,
                    chunk_overlap,
                    chunking_method=chunking_method,
                    semantic_threshold=semantic_threshold,
                    kb_id=kb_id,
                    original_filename=original_filename,
                )

                if not final_splits and not extracted_images:
                    logger.warning(f"[수집] 추출된 콘텐츠 없음: {original_filename}")
                    return

                # 텍스트 청크 처리
                if final_splits:
                    logger.info(f"[수집] 텍스트 청크 {len(final_splits)}개 처리 중...")
                    # 메타데이터 추가
                    for idx, split in enumerate(final_splits):
                        split.metadata.update(base_metadata)
                        split.metadata["chunk_index"] = idx
                        split.metadata["content_type"] = "text"

                    texts = [s.page_content for s in final_splits]
                    metadatas = [s.metadata for s in final_splits]

                    # 벡터 DB 저장 (BGE-m3 dense + BM25 sparse)
                    await self.vector_service.add_documents(kb_id, texts, metadatas, qdrant_client=qdrant_client)
                    logger.info(f"[수집] 벡터 DB 저장 완료: {len(texts)}개 텍스트 청크 (BGE + BM25)")

                    # CLIP 텍스트 임베딩 추가
                    await self._add_clip_text_embeddings(
                        texts, metadatas, kb_id, qdrant_client=qdrant_client
                    )

                    # 그래프 DB 저장 (상위 5개 청크만)
                    await self._save_to_graph(final_splits[:5], base_metadata)

                # 추출된 이미지 처리
                if extracted_images:
                    await self._index_images(
                        extracted_images,
                        base_metadata,
                        kb_id,
                        qdrant_client=qdrant_client,
                        vision_model=vision_model,
                    )

            # 청크 수 계산 및 파일 레코드 업데이트
            chunk_count = len(final_splits) if not is_image else 1
            await self._update_file_record(file_record_id, "completed", chunk_count=chunk_count)
            logger.info(f"[수집] 백그라운드 처리 완료: {original_filename} ✓")

        except Exception as e:
            logger.error(f"[수집] 백그라운드 처리 실패 ({original_filename}): {e}", exc_info=True)
            await self._update_file_record(file_record_id, "error", error_message=str(e)[:500])

        finally:
            # 임시 파일 삭제
            await self._cleanup_file(file_path_obj)

    async def _extract_docling_images(
        self,
        pictures: list,
        kb_id: str,
        doc_name: str,
    ) -> List[str]:
        """
        Docling으로 추출된 이미지를 파일로 저장

        Args:
            pictures: Docling doc.pictures (PIL Image 객체 리스트)
            kb_id: 지식베이스 ID
            doc_name: 원본 문서명

        Returns:
            저장된 이미지 파일 경로 리스트
        """
        if not pictures:
            return []

        try:
            from PIL import Image

            # KB별 이미지 디렉토리 생성
            kb_image_dir = self.image_storage_dir / f"kb_{kb_id}"
            kb_image_dir.mkdir(parents=True, exist_ok=True)

            image_paths = []

            for idx, pil_image in enumerate(pictures):
                try:
                    # UUID 파일명 생성
                    image_id = uuid.uuid4()
                    image_filename = f"{image_id}.png"
                    image_path = kb_image_dir / image_filename

                    # PIL Image 저장
                    pil_image.save(str(image_path), format="PNG")
                    image_paths.append(str(image_path))

                    logger.debug(f"[수집] 이미지 저장: {idx+1}/{len(pictures)} - {image_filename}")

                except Exception as e:
                    logger.warning(f"[수집] 이미지 저장 실패 (#{idx}): {e}")
                    continue

            logger.info(f"[수집] 이미지 추출 완료: {doc_name}에서 {len(image_paths)}개")
            return image_paths

        except Exception as e:
            logger.error(f"[수집] 이미지 추출 실패: {e}")
            return []

    async def _process_image_file(
        self,
        file_path: str,
        kb_id: str,
        original_filename: str,
    ) -> Optional[str]:
        """
        직접 업로드된 이미지 파일 처리 (.jpg, .png 등)

        처리 과정:
        1. 이미지 유효성 검증
        2. RGB 모드로 변환 (투명도 처리)
        3. 영구 저장소에 복사 (kb_{kb_id}/ 폴더)

        Args:
            file_path: 임시 파일 경로
            kb_id: 지식베이스 ID
            original_filename: 원본 파일명

        Returns:
            저장된 이미지 파일 경로 (실패 시 None)
        """
        try:
            from PIL import Image

            # KB별 이미지 디렉토리 생성
            kb_image_dir = self.image_storage_dir / f"kb_{kb_id}"
            kb_image_dir.mkdir(parents=True, exist_ok=True)

            # 이미지 유효성 검증
            img = Image.open(file_path)
            img.verify()

            # 재로드 (verify 후 필요)
            img = Image.open(file_path)

            # RGB로 변환 (RGBA → RGB)
            if img.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # 파일 확장자 추출
            ext = Path(original_filename).suffix.lower()
            if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
                ext = ".jpg"

            # UUID 파일명 생성
            image_id = uuid.uuid4()
            image_filename = f"{image_id}{ext}"
            image_path = kb_image_dir / image_filename

            # 저장 (고품질 JPEG 또는 원본 포맷)
            save_format = "JPEG" if ext in [".jpg", ".jpeg"] else ext[1:].upper()
            img.save(str(image_path), format=save_format, quality=95)

            file_size_kb = image_path.stat().st_size / 1024
            logger.info(f"[수집] 이미지 저장 완료: {original_filename} ({file_size_kb:.1f}KB) -> {image_filename}")
            return str(image_path)

        except Exception as e:
            logger.error(f"[수집] 이미지 파일 처리 실패: {e}")
            return None

    async def _parse_and_chunk(
        self,
        file_path: str,
        chunk_size: int,
        chunk_overlap: int,
        chunking_method: str = "fixed",
        semantic_threshold: float = 0.75,
        kb_id: str = "",
        original_filename: str = "",
    ) -> Tuple[List[Document], List[str]]:
        """
        문서 파싱 및 청킹 (이미지 추출 포함)

        Returns:
            (text_chunks, image_paths)
        """
        final_splits = []
        image_paths = []

        # Strategy 1: Docling 사용 (고급 파싱: 테이블, OCR, 이미지 추출)
        if self.converter:
            try:
                logger.info("[수집] Docling으로 파싱 중...")
                loop = asyncio.get_running_loop()
                conversion_result = await loop.run_in_executor(
                    None, self.converter.convert, file_path
                )
                doc = conversion_result.document
                cleaned_text = self.clean_markdown(doc.export_to_markdown())

                # 이미지 추출
                if hasattr(doc, 'pictures') and doc.pictures:
                    logger.info(f"[수집] 문서에서 {len(doc.pictures)}개 이미지 발견")
                    image_paths = await self._extract_docling_images(
                        doc.pictures, kb_id, original_filename
                    )

                if cleaned_text.strip():
                    final_splits = self._split_text(
                        cleaned_text, chunk_size, chunk_overlap,
                        chunking_method=chunking_method,
                        semantic_threshold=semantic_threshold,
                    )
                    if final_splits:
                        return final_splits, image_paths

            except Exception as e:
                logger.warning(f"[수집] Docling 파싱 실패: {e}, PyPDF 폴백 사용")

        # Strategy 2: HWP 파일 처리 (한글 문서)
        ext = Path(file_path).suffix.lower()
        if ext in (".hwp", ".hwpx"):
            try:
                logger.info("[수집] HWP 파일 파싱 중...")
                loop = asyncio.get_running_loop()
                full_text = await loop.run_in_executor(None, self._parse_hwp, file_path)
                full_text = self.clean_markdown(full_text)

                if full_text.strip():
                    final_splits = self._split_text(
                        full_text, chunk_size, chunk_overlap,
                        chunking_method=chunking_method,
                        semantic_threshold=semantic_threshold,
                    )
                    if final_splits:
                        return final_splits, image_paths

            except Exception as e:
                logger.error(f"[수집] HWP 파싱 실패: {e}")

            return final_splits, image_paths

        # Strategy 3: PyPDF Fallback (단순 텍스트 추출)
        try:
            logger.info("[수집] PyPDF로 폴백 파싱 중...")
            loader = PyPDFLoader(file_path)
            loop = asyncio.get_running_loop()
            raw_docs = await loop.run_in_executor(None, loader.load)

            full_text = self.clean_markdown("\n\n".join([d.page_content for d in raw_docs]))

            if full_text.strip():
                if chunking_method == "semantic":
                    final_splits = self._semantic_split(full_text, semantic_threshold)
                else:
                    text_splitter = RecursiveCharacterTextSplitter(
                        chunk_size=chunk_size,
                        chunk_overlap=chunk_overlap
                    )
                    final_splits = text_splitter.create_documents([full_text])

        except Exception as e:
            logger.error(f"[수집] PyPDF 파싱 실패: {e}")

        return final_splits, image_paths

    def _split_text(
        self,
        text: str,
        chunk_size: int,
        chunk_overlap: int,
        chunking_method: str = "fixed",
        semantic_threshold: float = 0.75,
    ) -> List[Document]:
        """텍스트를 청크로 분할"""
        if chunking_method == "semantic":
            return self._semantic_split(text, semantic_threshold)

        # 고정 크기: 마크다운 헤더 기반 분할 시도
        md_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=[("#", "H1"), ("##", "H2"), ("###", "H3")]
        )
        splits = md_splitter.split_text(text)

        if not splits:
            splits = [Document(page_content=text, metadata={})]

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        return text_splitter.split_documents(splits)

    def _semantic_split(
        self,
        text: str,
        semantic_threshold: float = 0.75,
    ) -> List[Document]:
        """
        LLM 기반 시맨틱 청킹: LLM이 텍스트를 읽고 의미 단위로 분할

        LLM이 직접 텍스트의 의미적 경계를 판단하여 분할점을 결정합니다.
        긴 텍스트는 윈도우 단위로 나눠 처리하고, 각 윈도우 내에서
        LLM이 의미적으로 자연스러운 분할점을 찾아 청크를 생성합니다.
        """
        logger.info(f"[수집] LLM 기반 시맨틱 청킹 시작...")

        try:
            # LLM 모델 선택 (그래프 추출과 동일 로직)
            graph_model = self._detect_graph_llm_model()
            llm = ChatOllama(
                model=graph_model,
                temperature=0.0,
            )

            # 1. 문장 단위로 분리
            sentences = self._split_into_sentences(text)
            if not sentences:
                return [Document(page_content=text, metadata={})]

            logger.info(f"[수집] 총 {len(sentences)}개 문장 추출")

            # 2. 윈도우 단위로 LLM에게 분할점 결정 요청
            # 한 번에 너무 많은 문장을 보내면 LLM 컨텍스트 초과 → 윈도우 처리
            window_size = 30  # 한 번에 처리할 문장 수
            all_chunks = []
            current_buffer = []

            i = 0
            while i < len(sentences):
                window = sentences[i:i + window_size]

                # LLM에게 분할점 요청
                split_indices = self._ask_llm_for_split_points(llm, window)

                if not split_indices:
                    # LLM이 분할점을 찾지 못하면 전체를 하나의 청크로
                    current_buffer.extend(window)
                    i += window_size
                    continue

                # 분할점에 따라 청크 생성
                prev_idx = 0
                for idx in sorted(split_indices):
                    if idx <= prev_idx or idx > len(window):
                        continue
                    chunk_sentences = window[prev_idx:idx]
                    if current_buffer:
                        chunk_sentences = current_buffer + chunk_sentences
                        current_buffer = []
                    chunk_text = " ".join(chunk_sentences).strip()
                    if chunk_text:
                        all_chunks.append(chunk_text)
                    prev_idx = idx

                # 마지막 분할점 이후 남은 문장은 다음 윈도우로 이월
                remaining = window[prev_idx:]
                current_buffer.extend(remaining)

                i += window_size

            # 남은 버퍼 처리
            if current_buffer:
                chunk_text = " ".join(current_buffer).strip()
                if chunk_text:
                    all_chunks.append(chunk_text)

            if not all_chunks:
                all_chunks = [text]

            documents = [Document(page_content=chunk, metadata={}) for chunk in all_chunks]
            logger.info(f"[수집] LLM 시맨틱 청킹 완료: {len(documents)}개 청크 생성 (model={graph_model})")
            return documents

        except Exception as e:
            logger.warning(f"[수집] LLM 시맨틱 청킹 실패: {e} - 고정 크기 청킹으로 폴백")

        # 폴백: 고정 크기 분할
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.RAG_CHUNK_SIZE,
            chunk_overlap=settings.RAG_CHUNK_OVERLAP,
        )
        return text_splitter.create_documents([text])

    @staticmethod
    def _split_into_sentences(text: str) -> List[str]:
        """텍스트를 문장 단위로 분리"""
        # 줄바꿈 기준 1차 분리 후, 마침표/물음표/느낌표로 2차 분리
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        sentences = []
        for line in lines:
            # 문장 끝 패턴으로 분리 (한국어/영어 모두 지원)
            parts = re.split(r'(?<=[.!?。])\s+', line)
            for part in parts:
                part = part.strip()
                if part:
                    sentences.append(part)
        return sentences

    def _ask_llm_for_split_points(
        self,
        llm,
        sentences: List[str],
    ) -> List[int]:
        """
        LLM에게 문장 리스트를 보여주고 의미적 분할점(인덱스)을 요청

        Returns:
            분할해야 할 문장 인덱스 리스트 (해당 인덱스 앞에서 분할)
        """
        if len(sentences) <= 3:
            return []

        # 번호가 매겨진 문장 목록 생성
        numbered = "\n".join(f"[{i}] {s}" for i, s in enumerate(sentences))

        prompt = (
            "아래 번호가 매겨진 문장 목록을 읽고, 의미(주제)가 바뀌는 지점의 문장 번호를 찾아주세요.\n"
            "각 청크는 하나의 완결된 주제나 개념을 담도록 분할해야 합니다.\n"
            "너무 잘게 나누지 마세요. 하나의 주제가 여러 문장에 걸쳐 설명되면 그것은 하나의 청크입니다.\n\n"
            f"문장 목록:\n{numbered}\n\n"
            "응답 형식: 분할점 문장 번호만 쉼표로 구분하여 출력하세요.\n"
            "예시: 5,12,18\n"
            "분할할 필요가 없으면 '없음'이라고 답하세요.\n"
            "번호 외의 다른 설명은 하지 마세요."
        )

        try:
            response = llm.invoke(prompt)
            content = response.content.strip()

            if "없음" in content or not content:
                return []

            # 숫자만 추출
            indices = []
            for token in re.findall(r'\d+', content):
                idx = int(token)
                if 0 < idx < len(sentences):
                    indices.append(idx)

            logger.debug(f"[수집] LLM 분할점: {indices} (문장 {len(sentences)}개 중)")
            return sorted(set(indices))

        except Exception as e:
            logger.warning(f"[수집] LLM 분할점 요청 실패: {e}")
            return []

    @staticmethod
    def _parse_hwp(file_path: str) -> str:
        """
        HWP (한글) 파일에서 텍스트 추출

        Strategy 1: pyhwp (hwp5) 라이브러리 사용
        Strategy 2: LibreOffice CLI를 통한 변환 (폴백)
        """
        text = ""

        # Strategy 1: pyhwp
        try:
            import hwp5.hwp5odt
            from hwp5.proc import plaintext
            import io

            output = io.StringIO()
            plaintext.main(file_path, output)
            text = output.getvalue()
            if text.strip():
                logger.info(f"[수집] HWP 파싱 성공 (pyhwp): {len(text)}자")
                return text
        except ImportError:
            logger.info("[수집] pyhwp 미설치 - LibreOffice 폴백 시도")
        except Exception as e:
            logger.warning(f"[수집] pyhwp 파싱 실패: {e}")

        # Strategy 1b: pyhwp 대체 방법 (hwp5html 텍스트 추출)
        try:
            from hwp5.hwp5html import HTMLTransform
            from hwp5.xmlmodel import Hwp5File
            import io

            hwp_file = Hwp5File(file_path)
            # 본문 스트림에서 텍스트 추출
            for section in hwp_file.bodytext:
                stream = hwp_file.bodytext[section]
                text += stream.read().decode("utf-16-le", errors="ignore")

            if text.strip():
                logger.info(f"[수집] HWP 파싱 성공 (hwp5 직접): {len(text)}자")
                return text
        except Exception as e:
            logger.warning(f"[수집] hwp5 직접 파싱 실패: {e}")

        # Strategy 2: LibreOffice CLI 변환
        try:
            import subprocess
            import tempfile

            with tempfile.TemporaryDirectory() as tmpdir:
                result = subprocess.run(
                    ["soffice", "--headless", "--convert-to", "txt:Text", "--outdir", tmpdir, file_path],
                    capture_output=True, text=True, timeout=60,
                )
                if result.returncode == 0:
                    txt_files = list(Path(tmpdir).glob("*.txt"))
                    if txt_files:
                        text = txt_files[0].read_text(encoding="utf-8", errors="ignore")
                        if text.strip():
                            logger.info(f"[수집] HWP 파싱 성공 (LibreOffice): {len(text)}자")
                            return text

        except FileNotFoundError:
            logger.warning("[수집] LibreOffice(soffice) 미설치 - HWP 변환 불가")
        except subprocess.TimeoutExpired:
            logger.warning("[수집] LibreOffice 변환 타임아웃 (60s)")
        except Exception as e:
            logger.warning(f"[수집] LibreOffice 변환 실패: {e}")

        if not text.strip():
            raise Exception(
                "HWP 파일을 파싱할 수 없습니다. "
                "다음 중 하나를 설치해주세요: "
                "1) pip install pyhwp  "
                "2) apt install libreoffice"
            )

        return text

    async def _add_clip_text_embeddings(
        self,
        texts: List[str],
        metadatas: List[dict],
        kb_id: str,
        qdrant_client=None,
    ):
        """
        텍스트 청크에 CLIP 텍스트 임베딩 추가 (크로스 모달 검색용)

        CLIP 텍스트 임베딩을 생성하여 Qdrant의 "clip" 벡터로 저장합니다.
        이를 통해 텍스트 쿼리로 관련 이미지를 검색할 수 있습니다.

        Args:
            texts: 텍스트 리스트
            metadatas: 메타데이터 리스트
            kb_id: 지식베이스 ID
            qdrant_client: Qdrant 클라이언트 (선택)
        """
        try:
            logger.info(f"[수집] CLIP 텍스트 임베딩 생성 중: {len(texts)}개 청크...")

            # CLIP 텍스트 임베딩 생성 (배치)
            loop = asyncio.get_running_loop()
            clip_vectors = await loop.run_in_executor(
                None,
                self.clip_embeddings.embed_texts_for_cross_modal,
                texts
            )

            # Qdrant에 CLIP 벡터 추가
            collection_name = f"kb_{kb_id}"
            from app.services.vdb.qdrant_store import QdrantStore

            # QdrantStore 인스턴스 생성
            client = qdrant_client or self.vector_service.get_client()
            user_id = metadatas[0].get("user_id") if metadatas else None

            store = QdrantStore(
                client=client,
                collection_name=collection_name,
                embeddings=self.embeddings,
                embedding_dimension=settings.EMBEDDING_DIMENSION,
                user_id=user_id,
            )

            # CLIP 벡터 업데이트 (기존 포인트에 clip 벡터 추가)
            await store.add_clip_text_vectors(texts, clip_vectors, metadatas)

            logger.info(f"[수집] CLIP 텍스트 임베딩 추가 완료: {len(texts)}개 청크")

        except Exception as e:
            logger.warning(f"[수집] CLIP 텍스트 임베딩 추가 실패: {e}")

    async def _index_images(
        self,
        image_paths: List[str],
        base_metadata: dict,
        kb_id: str,
        qdrant_client=None,
        vision_model: Optional[str] = None,
    ):
        """
        이미지들을 CLIP으로 임베딩하여 Qdrant에 인덱싱

        처리 과정:
        1. CLIP 이미지 임베딩 생성 (512-dim)
        2. 이미지 캡션 생성 (BLIP, 선택적)
        3. OCR 텍스트 추출 (EasyOCR, 선택적)
        4. 썸네일 생성 (웹 표시용)
        5. Qdrant에 저장 (content_type="image")

        Args:
            image_paths: 이미지 파일 경로 리스트
            base_metadata: 기본 메타데이터
            kb_id: 지식베이스 ID
            qdrant_client: Qdrant 클라이언트 (선택)
        """
        if not image_paths:
            return

        try:
            logger.info(f"[수집] 이미지 인덱싱 시작: {len(image_paths)}개 (CLIP + 캡셔닝 + OCR)...")

            # CLIP 이미지 임베딩 생성 (배치)
            loop = asyncio.get_running_loop()
            clip_vectors = await loop.run_in_executor(
                None,
                self.clip_embeddings.embed_images,
                image_paths
            )

            if not clip_vectors:
                logger.warning("[수집] CLIP 벡터 생성 실패 - 이미지 인덱싱 건너뜀")
                return

            # 이미지 캡션 생성 (배치, 설정에 따라 활성화)
            if settings.ENABLE_CAPTIONING:
                captions = await loop.run_in_executor(
                    None,
                    self.image_captioning.generate_captions_batch,
                    image_paths,
                    50,  # max_length
                    10,  # min_length
                    settings.CAPTION_BATCH_SIZE
                )
            else:
                captions = [""] * len(image_paths)

            # 이미지 OCR (배치, 설정에 따라 활성화)
            if settings.ENABLE_OCR:
                ocr_texts = await loop.run_in_executor(
                    None,
                    self.image_ocr.extract_texts_batch,
                    image_paths
                )
            else:
                ocr_texts = [""] * len(image_paths)

            # 썸네일 생성 (배치, 설정에 따라 활성화)
            if settings.ENABLE_THUMBNAIL:
                from app.services.thumbnail_generator import get_thumbnail_generator
                thumb_gen = get_thumbnail_generator()
                thumbnails = await loop.run_in_executor(
                    None,
                    thumb_gen.generate_thumbnails_batch,
                    image_paths
                )
            else:
                thumbnails = [None] * len(image_paths)

            # VLM (Ollama Vision) 으로 이미지 설명 생성 (캡셔닝보다 더 풍부한 설명)
            vlm_descriptions = [""] * len(image_paths)
            try:
                vlm_descriptions = await self._generate_vlm_descriptions(image_paths, vision_model=vision_model)
                logger.info(f"[수집] VLM 이미지 설명 생성 완료: {sum(1 for d in vlm_descriptions if d)}개 성공")
            except Exception as e:
                logger.warning(f"[수집] VLM 이미지 설명 생성 실패 (캡셔닝/OCR로 폴백): {e}")

            # Qdrant에 이미지 문서 추가
            collection_name = f"kb_{kb_id}"
            from app.services.vdb.qdrant_store import QdrantStore
            from PIL import Image

            # QdrantStore 인스턴스 생성
            client = qdrant_client or self.vector_service.get_client()
            user_id = base_metadata.get("user_id")

            store = QdrantStore(
                client=client,
                collection_name=collection_name,
                embeddings=self.embeddings,
                embedding_dimension=settings.EMBEDDING_DIMENSION,
                user_id=user_id,
            )

            # 이미지 메타데이터 생성
            image_docs = []
            for path, clip_vec, caption, ocr_text, thumbnail, vlm_desc in zip(
                image_paths, clip_vectors, captions, ocr_texts, thumbnails, vlm_descriptions
            ):
                path_obj = Path(path)

                # 이미지 크기 및 해상도 추출
                try:
                    img = Image.open(path)
                    width, height = img.size
                    file_size = path_obj.stat().st_size
                except Exception as e:
                    logger.warning(f"[수집] 이미지 정보 조회 실패 ({path_obj.name}): {e}")
                    width, height = 0, 0
                    file_size = 0

                # 웹 경로 변환 (/images/kb_xxx/file.png)
                storage_dir = self.image_storage_dir
                relative_image_path = path_obj.relative_to(storage_dir)
                web_image_path = f"/images/{relative_image_path.as_posix()}"

                web_thumbnail_path = ""
                if thumbnail:
                    thumbnail_obj = Path(thumbnail)
                    relative_thumb_path = thumbnail_obj.relative_to(storage_dir)
                    web_thumbnail_path = f"/images/{relative_thumb_path.as_posix()}"

                # 메타데이터 구성
                # VLM 설명이 있으면 caption에 VLM 설명 사용 (프론트엔드 표시용)
                display_caption = vlm_desc if vlm_desc else (caption if caption else "")
                metadata = {
                    **base_metadata,
                    "content_type": "image",
                    "image_path": web_image_path,  # Web URL 경로
                    "image_filename": path_obj.name,
                    "image_size": file_size,
                    "image_dimensions": f"{width}x{height}",
                    "caption": display_caption,  # VLM 설명 우선, BLIP 캡션 폴백
                    "blip_caption": caption if caption else "",  # 원본 BLIP 캡션 보존
                    "vlm_description": vlm_desc if vlm_desc else "",  # VLM 설명 원본
                    "ocr_text": ocr_text if ocr_text else "",  # OCR 추출 텍스트
                    "thumbnail_path": web_thumbnail_path,  # Web URL 경로
                }

                # page_content: VLM 설명 > 캡션 + OCR 텍스트 > 파일명
                content_parts = [f"[IMAGE: {path_obj.name}]"]
                if vlm_desc:
                    content_parts.append(f"Description: {vlm_desc}")
                elif caption:
                    content_parts.append(f"Description: {caption}")
                if ocr_text:
                    content_parts.append(f"Text: {ocr_text}")

                page_content = " | ".join(content_parts)

                image_docs.append({
                    "content": page_content,
                    "metadata": metadata,
                    "clip_vector": clip_vec,
                })

            # Qdrant에 이미지 문서 추가
            await store.add_image_documents(image_docs)

            logger.info(f"[수집] 이미지 인덱싱 완료: {len(image_docs)}개 성공 ✓")

        except Exception as e:
            logger.error(f"[수집] 이미지 인덱싱 실패: {e}", exc_info=True)

    async def _generate_vlm_descriptions(self, image_paths: List[str], vision_model: Optional[str] = None) -> List[str]:
        """
        Ollama Vision 모델(llava 등)을 사용하여 이미지 설명 생성

        BLIP 캡셔닝보다 더 풍부하고 정확한 설명을 생성합니다.
        이미지에 포함된 텍스트도 함께 추출합니다.

        Args:
            image_paths: 이미지 파일 경로 리스트
            vision_model: 유저 설정에서 선택한 VLM 모델 (None이면 settings.VISION_MODEL 사용)

        Returns:
            각 이미지에 대한 VLM 설명 리스트
        """
        import base64
        import httpx

        descriptions = []
        vision_model = vision_model or settings.VISION_MODEL
        logger.info(f"[수집] VLM 모델: {vision_model}")

        prompt = (
            "이 이미지를 자세히 분석해주세요. 다음 내용을 포함해서 설명해주세요:\n"
            "1. 이미지에 보이는 주요 내용과 객체\n"
            "2. 이미지에 포함된 모든 텍스트 (글자, 숫자, 기호 등)\n"
            "3. 표나 차트가 있으면 그 내용\n"
            "가능한 한 자세하게 한국어로 설명해주세요."
        )

        async with httpx.AsyncClient(timeout=60.0) as client:
            for path in image_paths:
                try:
                    # 이미지를 base64로 인코딩
                    with open(path, "rb") as f:
                        image_data = base64.b64encode(f.read()).decode("utf-8")

                    # Ollama Vision API 호출
                    response = await client.post(
                        f"{settings.OLLAMA_BASE_URL}/api/generate",
                        json={
                            "model": vision_model,
                            "prompt": prompt,
                            "images": [image_data],
                            "stream": False,
                        },
                        timeout=60.0,
                    )

                    if response.status_code == 200:
                        data = response.json()
                        desc = data.get("response", "").strip()
                        descriptions.append(desc)
                        logger.info(f"[수집] VLM 설명 생성 완료: {Path(path).name} ({len(desc)}자)")
                    else:
                        body = response.text[:200] if response.text else "no body"
                        logger.warning(f"[수집] VLM API 오류 ({response.status_code}): {Path(path).name} - {body}")
                        descriptions.append("")

                except Exception as e:
                    logger.warning(f"[수집] VLM 설명 생성 실패 ({Path(path).name}): {e}", exc_info=True)
                    descriptions.append("")

        return descriptions

    async def _save_to_graph(self, splits: List[Document], base_metadata: dict):
        """
        그래프 DB에 저장 (Neo4j)

        LLM을 사용하여 텍스트에서 엔티티와 관계를 추출한 후
        Neo4j에 그래프로 저장합니다. 사용자별/KB별로 격리됩니다.
        """
        if not splits:
            return

        # Neo4j 연결 확인
        if not self.graph_service.ensure_connection():
            logger.warning("[수집] Neo4j 미연결 - 그래프 저장 건너뜀")
            return

        # LLMGraphTransformer 사용 가능 확인
        transformer = self.llm_transformer
        if transformer is None:
            logger.warning("[수집] LLMGraphTransformer 사용 불가 - 그래프 저장 건너뜀 "
                           "(tool calling 미지원 모델이거나 LLM 연결 실패)")
            return

        try:
            logger.info(f"[수집] 그래프 변환 시작: {len(splits)}개 청크...")
            # CPU-bound 작업을 스레드풀에서 실행 (LLM 호출 포함)
            loop = asyncio.get_running_loop()
            try:
                graph_docs = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        transformer.convert_to_graph_documents,
                        splits
                    ),
                    timeout=120  # 2분 타임아웃
                )
            except asyncio.TimeoutError:
                logger.error("[수집] 그래프 변환 타임아웃 (120s) - LLM 응답 없음")
                return

            if not graph_docs:
                logger.warning("[수집] LLM이 엔티티를 추출하지 못함")
                return

            for g in graph_docs:
                g.source = Document(page_content="Source", metadata=base_metadata)

            kb_id = base_metadata.get("kb_id", "default")
            user_id = base_metadata.get("user_id", -1)
            result = self.graph_service.add_graph_documents_with_metadata(graph_docs, kb_id, user_id)
            if result:
                logger.info(f"[수집] 그래프 DB 저장 완료: kb={kb_id}, user={user_id}, docs={len(graph_docs)}")
            else:
                logger.error(f"[수집] 그래프 DB 저장 실패: kb={kb_id}, user={user_id}")

        except Exception as e:
            logger.error(f"[수집] 그래프 DB 저장 실패: {e}", exc_info=True)

    async def _cleanup_file(self, file_path: Path):
        """
        임시 파일 정리 (디스크 공간 절약)

        업로드된 파일을 처리한 후 임시 디렉토리에서 삭제합니다.
        """
        try:
            if file_path.exists():
                file_path.unlink()
                logger.debug(f"[수집] 임시 파일 삭제: {file_path.name}")
        except Exception as e:
            logger.warning(f"[수집] 임시 파일 삭제 실패: {e}")


@lru_cache()
def get_ingestion_service() -> IngestionService:
    """싱글톤 IngestionService 인스턴스 반환"""
    return IngestionService()
