import os
import shutil
import logging
import datetime
import torch
import re
from fastapi import UploadFile
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_experimental.graph_transformers import LLMGraphTransformer
from langchain_ollama import ChatOllama
from langchain_core.documents import Document
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableStructureOptions
from docling.datamodel.base_models import InputFormat

from app.services.vector_store import VectorStoreService
from app.services.graph_store import GraphStoreService
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class IngestionService:
    def __init__(self):
        self.vector_service = VectorStoreService()
        self.graph_service = GraphStoreService()
        self.upload_dir = "/tmp/rag_uploads"
        os.makedirs(self.upload_dir, exist_ok=True)
        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL

        # [수정 1] OCR(문자 인식) 강제 활성화 설정
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = True  # OCR 켜기
        pipeline_options.do_table_structure = True # 표 구조 인식 켜기
        pipeline_options.table_structure_options.do_cell_matching = True

        # DocumentConverter에 옵션 적용
        self.converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                InputFormat.IMAGE: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )

        device = "cpu"
        if torch.cuda.is_available(): device = "cuda"
        elif torch.backends.mps.is_available(): device = "mps"

        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': device, 'trust_remote_code': True},
            encode_kwargs={'normalize_embeddings': True}
        )
        
        self.llm = ChatOllama(model=settings.LLM_MODEL, temperature=0)
        
        self.llm_transformer = LLMGraphTransformer(
            llm=self.llm,
            allowed_nodes=["Client", "Project", "Technology", "Requirement", "Budget", "Timeline", "Department", "Document"],
            allowed_relationships=["ISSUED_BY", "REQUIRES", "HAS_BUDGET", "USED", "MENTIONS"],
            strict_mode=False 
        )

    def clean_markdown(self, text: str) -> str:
        """
        [수정 2] 의미 없는 특수문자나 빈 표 테두리 제거
        """
        lines = []
        for line in text.split('\n'):
            stripped = line.strip()
            # 1. 빈 줄 패스
            if not stripped: continue
            
            # 2. | 또는 - 만으로 구성된 줄(표 테두리)인데 글자가 없는 경우 패스
            # 예: |---|---| 또는 +---+
            if re.match(r'^[|\-\+\s]+$', stripped):
                continue
            
            lines.append(line)
        
        return '\n'.join(lines)

    async def process_file(self, file: UploadFile, kb_id: str, user_id: int, chunk_size: int = 500):
        file_path = os.path.join(self.upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        try:
            logger.info(f"Processing file: {file.filename} for User: {user_id}")
            
            # 문서 변환 (OCR 수행)
            conversion_result = self.converter.convert(file_path)
            doc = conversion_result.document
            markdown_text = doc.export_to_markdown()
            
            # [수정 3] 추출된 텍스트 정제
            cleaned_text = self.clean_markdown(markdown_text)
            
            if not cleaned_text.strip(): 
                return False, "텍스트를 추출할 수 없습니다. (이미지 화질이 낮거나 글자가 없을 수 있음)"

            base_metadata = {
                "source": file.filename,
                "kb_id": kb_id,
                "user_id": user_id,
                "title": doc.name or file.filename,
                "uploaded_at": datetime.datetime.now().isoformat(),
            }

            markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "H1"), ("##", "H2")])
            md_header_splits = markdown_splitter.split_text(cleaned_text)
            
            # 헤더가 없어서 통으로 들어간 경우 처리
            if not md_header_splits:
                md_header_splits = [Document(page_content=cleaned_text, metadata={})]

            text_splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=50)
            final_splits = text_splitter.split_documents(md_header_splits)

            for idx, split in enumerate(final_splits):
                split.metadata.update(base_metadata)
                split.metadata["chunk_index"] = idx

            texts = [split.page_content for split in final_splits]
            metadatas = [split.metadata for split in final_splits]
            
            if not texts:
                return False, "청킹 결과가 비어있습니다."

            # DB 저장
            await self.vector_service.add_documents(kb_id, texts, metadatas)
            
            # 그래프 저장 (일부만)
            try:
                subset_splits = final_splits[:3] 
                graph_documents = self.llm_transformer.convert_to_graph_documents(subset_splits)
                for graph_doc in graph_documents:
                    graph_doc.source = Document(page_content="Source", metadata=base_metadata)
                self.graph_service.add_graph_documents(graph_documents)
            except Exception as e:
                logger.warning(f"Graph extraction failed (non-fatal): {e}")

            return True, f"File processed successfully. (Extracted {len(texts)} chunks)"

        except Exception as e:
            logger.error(f"Ingestion Error: {str(e)}")
            import traceback
            traceback.print_exc()
            return False, str(e)
        finally:
            if os.path.exists(file_path): os.remove(file_path)