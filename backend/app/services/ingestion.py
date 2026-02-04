import os
import shutil
import logging
import datetime
import torch
import re
from fastapi import UploadFile, BackgroundTasks
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_experimental.graph_transformers import LLMGraphTransformer
from langchain_ollama import ChatOllama
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader 
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

        # Docling Setup
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = True
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.do_cell_matching = True
        self.converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                InputFormat.IMAGE: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )

        device = "cpu" if not torch.cuda.is_available() else "cuda"
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': device, 'trust_remote_code': True},
            encode_kwargs={'normalize_embeddings': True}
        )
        self.llm = ChatOllama(model=settings.LLM_MODEL, temperature=0)
        self.llm_transformer = LLMGraphTransformer(
            llm=self.llm,
            allowed_nodes=["Entity", "Concept", "Person", "Place", "Event"],
            allowed_relationships=["RELATION", "INCLUDES", "INVOLVES", "CAUSES"],
            strict_mode=False 
        )

    def clean_markdown(self, text: str) -> str:
        lines = []
        for line in text.split('\n'):
            stripped = line.strip()
            if not stripped: continue
            if re.match(r'^[|\-+\s]+$', stripped): continue
            lines.append(line)
        return '\n'.join(lines)

    async def process_file(self, file: UploadFile, kb_id: str, user_id: int):
        # 1. 파일 임시 저장
        file_path = os.path.join(self.upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return file_path

    # ✅ 비동기 작업용 메서드 (Background Task)
    async def process_file_background(self, file_path: str, filename: str, kb_id: str, user_id: int):
        logger.info(f"🚀 [Async] Processing started: {filename}")
        base_metadata = {
            "source": filename,
            "kb_id": kb_id,
            "user_id": user_id,
            "uploaded_at": datetime.datetime.now().isoformat(),
        }

        try:
            texts, metadatas, final_splits = [], [], []
            
            # --- Strategy 1: Docling ---
            try:
                logger.info("Trying Docling...")
                conversion_result = self.converter.convert(file_path)
                doc = conversion_result.document
                cleaned_text = self.clean_markdown(doc.export_to_markdown())
                
                if not cleaned_text.strip(): raise ValueError("Empty text")
                
                md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "H1"), ("##", "H2")])
                splits = md_splitter.split_text(cleaned_text)
                if not splits: splits = [Document(page_content=cleaned_text, metadata={})]
                
                text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
                final_splits = text_splitter.split_documents(splits)
                
            except Exception as e:
                # --- Strategy 2: Fallback (PyPDFLoader) ---
                logger.warning(f"Docling failed ({e}). Switching to Fallback.")
                try:
                    loader = PyPDFLoader(file_path)
                    raw_docs = loader.load()
                    full_text = self.clean_markdown("\n\n".join([d.page_content for d in raw_docs]))
                    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
                    final_splits = text_splitter.create_documents([full_text])
                except Exception as e2:
                    logger.error(f"Fallback failed: {e2}")
                    return

            # Metadata Update
            for idx, split in enumerate(final_splits):
                split.metadata.update(base_metadata)
                split.metadata["chunk_index"] = idx

            texts = [s.page_content for s in final_splits]
            metadatas = [s.metadata for s in final_splits]

            # DB Save (Vector)
            await self.vector_service.add_documents(kb_id, texts, metadatas)
            logger.info(f"✅ Vector Store Saved: {len(texts)} chunks")

            # DB Save (Graph) - Limit 5 for speed
            try:
                subset = final_splits[:5]
                graph_docs = self.llm_transformer.convert_to_graph_documents(subset)
                for g in graph_docs: g.source = Document(page_content="Source", metadata=base_metadata)
                self.graph_service.add_graph_documents(graph_docs)
                logger.info("✅ Graph Store Saved")
            except Exception as e:
                logger.warning(f"Graph failed: {e}")

        except Exception as e:
            logger.error(f"Fatal Error: {e}")
        finally:
            if os.path.exists(file_path): os.remove(file_path)