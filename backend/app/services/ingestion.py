"""
문서 수집 서비스
- 파일 업로드 처리
- 문서 파싱 (Docling, PyPDF)
- 청킹 및 임베딩
- 벡터/그래프 DB 저장
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
        IngestionService._initialized = True

        self.vector_service = get_vector_store_service()
        self.graph_service = get_graph_store_service()

        # 크로스 플랫폼 임시 디렉토리 사용
        self.upload_dir = Path(tempfile.gettempdir()) / "rag_uploads"
        self.upload_dir.mkdir(parents=True, exist_ok=True)

        # Ollama 환경 설정
        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL

        # Docling 초기화 (지연 로딩)
        self._converter = None

        # 디바이스 설정
        self._device = self._get_device()

        # 임베딩 모델 (지연 로딩)
        self._embeddings = None

        # LLM (지연 로딩)
        self._llm = None
        self._llm_transformer = None

        logger.info("IngestionService initialized (singleton)")

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
                logger.warning("Docling not available - using fallback parser only")
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
        파일을 안전하게 저장하고 파일 경로와 원본 파일명을 반환합니다.
        비동기 파일 I/O 사용
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

            logger.info(f"File saved: {original_filename} -> {safe_filename}")
            return str(file_path), original_filename

        except Exception as e:
            logger.error(f"File save failed: {e}")
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
        백그라운드에서 파일을 처리합니다.
        처리 완료 후 임시 파일을 삭제합니다.
        """
        logger.info(f"[Background] Processing started: {original_filename} (method={chunking_method})")

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
                logger.error(f"File not found: {file_path}")
                return

            # 문서 파싱 및 청킹
            final_splits = await self._parse_and_chunk(
                file_path,
                chunk_size,
                chunk_overlap,
                chunking_method=chunking_method,
                semantic_threshold=semantic_threshold,
            )

            if not final_splits:
                logger.warning(f"No content extracted from: {original_filename}")
                return

            # 메타데이터 추가
            for idx, split in enumerate(final_splits):
                split.metadata.update(base_metadata)
                split.metadata["chunk_index"] = idx

            texts = [s.page_content for s in final_splits]
            metadatas = [s.metadata for s in final_splits]

            # 벡터 DB 저장
            await self.vector_service.add_documents(kb_id, texts, metadatas, qdrant_client=qdrant_client)
            logger.info(f"Vector Store saved: {len(texts)} chunks")

            # 그래프 DB 저장 (상위 5개 청크만)
            await self._save_to_graph(final_splits[:5], base_metadata)

            logger.info(f"Processing completed: {original_filename}")

        except Exception as e:
            logger.error(f"Processing failed for {original_filename}: {e}", exc_info=True)

        finally:
            # 임시 파일 삭제
            await self._cleanup_file(file_path_obj)

    async def _parse_and_chunk(
        self,
        file_path: str,
        chunk_size: int,
        chunk_overlap: int,
        chunking_method: str = "fixed",
        semantic_threshold: float = 0.75,
    ) -> List[Document]:
        """문서 파싱 및 청킹"""
        final_splits = []

        # Strategy 1: Docling 사용
        if self.converter:
            try:
                logger.info("Parsing with Docling...")
                loop = asyncio.get_event_loop()
                conversion_result = await loop.run_in_executor(
                    None, self.converter.convert, file_path
                )
                doc = conversion_result.document
                cleaned_text = self.clean_markdown(doc.export_to_markdown())

                if cleaned_text.strip():
                    final_splits = self._split_text(
                        cleaned_text, chunk_size, chunk_overlap,
                        chunking_method=chunking_method,
                        semantic_threshold=semantic_threshold,
                    )
                    if final_splits:
                        return final_splits

            except Exception as e:
                logger.warning(f"Docling parsing failed: {e}")

        # Strategy 2: PyPDF Fallback
        try:
            logger.info("Falling back to PyPDF...")
            loader = PyPDFLoader(file_path)
            loop = asyncio.get_event_loop()
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
            logger.error(f"PyPDF parsing failed: {e}")

        return final_splits

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
        """시맨틱 청킹: 의미 변화 지점에서 텍스트를 분할"""
        try:
            from langchain_experimental.text_splitter import SemanticChunker

            embeddings = self.vector_service.embeddings
            chunker = SemanticChunker(
                embeddings=embeddings,
                breakpoint_threshold_type="percentile",
                breakpoint_threshold_amount=semantic_threshold * 100,
            )
            documents = chunker.create_documents([text])
            logger.info(f"Semantic chunking produced {len(documents)} chunks")
            return documents

        except ImportError:
            logger.warning("langchain_experimental not available, falling back to fixed-size chunking")
        except Exception as e:
            logger.warning(f"Semantic chunking failed: {e}, falling back to fixed-size chunking")

        # 폴백: 고정 크기 분할
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.RAG_CHUNK_SIZE,
            chunk_overlap=settings.RAG_CHUNK_OVERLAP,
        )
        return text_splitter.create_documents([text])

    async def _save_to_graph(self, splits: List[Document], base_metadata: dict):
        """그래프 DB에 저장"""
        if not splits:
            return

        try:
            # CPU-bound 작업을 스레드풀에서 실행
            loop = asyncio.get_event_loop()
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
            logger.info("Graph Store saved (with kb_id/user_id tags)")

        except Exception as e:
            logger.warning(f"Graph store failed: {e}")

    async def _cleanup_file(self, file_path: Path):
        """임시 파일 정리"""
        try:
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Temporary file deleted: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to delete temp file: {e}")


@lru_cache()
def get_ingestion_service() -> IngestionService:
    """싱글톤 IngestionService 인스턴스 반환"""
    return IngestionService()
