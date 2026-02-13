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
import torch
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
        """사용 가능한 디바이스 반환"""
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    @property
    def converter(self):
        """Docling DocumentConverter (지연 로딩)"""
        if self._converter is None:
            try:
                from docling.document_converter import DocumentConverter, PdfFormatOption
                from docling.datamodel.pipeline_options import PdfPipelineOptions
                from docling.datamodel.base_models import InputFormat

                pipeline_options = PdfPipelineOptions()
                pipeline_options.do_ocr = True
                pipeline_options.do_table_structure = True
                pipeline_options.table_structure_options.do_cell_matching = True

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

    @property
    def llm_transformer(self):
        """LLM Graph Transformer (지연 로딩)"""
        if self._llm_transformer is None:
            if self._llm is None:
                self._llm = ChatOllama(
                    model=settings.LLM_MODEL,
                    temperature=settings.LLM_TEMPERATURE
                )
            self._llm_transformer = LLMGraphTransformer(
                llm=self._llm,
                allowed_nodes=["Entity", "Concept", "Person", "Place", "Event"],
                allowed_relationships=["RELATION", "INCLUDES", "INVOLVES", "CAUSES"],
                strict_mode=False
            )
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

    @staticmethod
    def clean_markdown(text: str) -> str:
        """마크다운 텍스트 정리"""
        lines = []
        for line in text.split('\n'):
            stripped = line.strip()
            if not stripped:
                continue
            # 테이블 구분선 제거
            if re.match(r'^[|\-+\s]+$', stripped):
                continue
            lines.append(line)
        return '\n'.join(lines)

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

        try:
            # 파일 존재 확인
            if not file_path_obj.exists():
                logger.error(f"[수집] 파일 없음: {file_path}")
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
                        qdrant_client=qdrant_client
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
                        qdrant_client=qdrant_client
                    )

            logger.info(f"[수집] 백그라운드 처리 완료: {original_filename} ✓")

        except Exception as e:
            logger.error(f"[수집] 백그라운드 처리 실패 ({original_filename}): {e}", exc_info=True)

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

        # Strategy 2: PyPDF Fallback (단순 텍스트 추출)
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
        시맨틱 청킹: 의미 변화 지점에서 텍스트를 분할

        임베딩 유사도를 기반으로 자연스러운 문맥 경계에서 분할
        고정 크기 분할보다 의미적으로 일관된 청크 생성
        """
        try:
            from langchain_experimental.text_splitter import SemanticChunker

            logger.info(f"[수집] 시맨틱 청킹 시작 (임계값={semantic_threshold})...")
            embeddings = self.vector_service.embeddings
            chunker = SemanticChunker(
                embeddings=embeddings,
                breakpoint_threshold_type="percentile",
                breakpoint_threshold_amount=semantic_threshold * 100,
            )
            documents = chunker.create_documents([text])
            logger.info(f"[수집] 시맨틱 청킹 완료: {len(documents)}개 청크 생성")
            return documents

        except ImportError:
            logger.warning("[수집] langchain_experimental 미설치 - 고정 크기 청킹으로 폴백")
        except Exception as e:
            logger.warning(f"[수집] 시맨틱 청킹 실패: {e} - 고정 크기 청킹으로 폴백")

        # 폴백: 고정 크기 분할
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.RAG_CHUNK_SIZE,
            chunk_overlap=settings.RAG_CHUNK_OVERLAP,
        )
        return text_splitter.create_documents([text])

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
            for path, clip_vec, caption, ocr_text, thumbnail in zip(
                image_paths, clip_vectors, captions, ocr_texts, thumbnails
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
                metadata = {
                    **base_metadata,
                    "content_type": "image",
                    "image_path": web_image_path,  # Web URL 경로
                    "image_filename": path_obj.name,
                    "image_size": file_size,
                    "image_dimensions": f"{width}x{height}",
                    "caption": caption if caption else "",  # BLIP 캡션
                    "ocr_text": ocr_text if ocr_text else "",  # OCR 추출 텍스트
                    "thumbnail_path": web_thumbnail_path,  # Web URL 경로
                }

                # page_content는 캡션 + OCR 텍스트 + 파일명
                content_parts = [f"[IMAGE: {path_obj.name}]"]
                if caption:
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

    async def _save_to_graph(self, splits: List[Document], base_metadata: dict):
        """
        그래프 DB에 저장 (Neo4j)

        LLM을 사용하여 텍스트에서 엔티티와 관계를 추출한 후
        Neo4j에 그래프로 저장합니다. 사용자별/KB별로 격리됩니다.
        """
        if not splits:
            return

        try:
            logger.info(f"[수집] 그래프 변환 시작: {len(splits)}개 청크...")
            # CPU-bound 작업을 스레드풀에서 실행
            loop = asyncio.get_running_loop()
            graph_docs = await loop.run_in_executor(
                None,
                self.llm_transformer.convert_to_graph_documents,
                splits
            )

            for g in graph_docs:
                g.source = Document(page_content="Source", metadata=base_metadata)

            kb_id = base_metadata.get("kb_id", "default")
            user_id = base_metadata.get("user_id", -1)
            self.graph_service.add_graph_documents_with_metadata(graph_docs, kb_id, user_id)
            logger.info(f"[수집] 그래프 DB 저장 완료: kb={kb_id}, user={user_id}")

        except Exception as e:
            logger.warning(f"[수집] 그래프 DB 저장 실패: {e}")

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
