import os
import shutil
import logging
import datetime
import torch
from fastapi import UploadFile
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_experimental.graph_transformers import LLMGraphTransformer
from langchain_ollama import ChatOllama
from langchain_core.documents import Document
from docling.document_converter import DocumentConverter
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
        self.converter = DocumentConverter()
        os.environ["OLLAMA_HOST"] = settings.OLLAMA_BASE_URL

        device = "cpu"
        if torch.cuda.is_available(): device = "cuda"
        elif torch.backends.mps.is_available(): device = "mps"

        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': device},
            encode_kwargs={'normalize_embeddings': True}
        )
        
        self.llm = ChatOllama(model=settings.LLM_MODEL, temperature=0)
        
        # RFP 온톨로지
        self.llm_transformer = LLMGraphTransformer(
            llm=self.llm,
            allowed_nodes=["Client", "Project", "Technology", "Requirement", "Budget", "Timeline", "Department", "Document"],
            allowed_relationships=["ISSUED_BY", "REQUIRES", "HAS_BUDGET", "USED", "MENTIONS"],
            strict_mode=False 
        )

    async def process_file(self, file: UploadFile, kb_id: str, user_id: int, chunk_size: int = 500):
        """
        [핵심] user_id 파라미터 추가됨
        """
        file_path = os.path.join(self.upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        try:
            logger.info(f"Processing file: {file.filename} for User: {user_id}")
            
            conversion_result = self.converter.convert(file_path)
            doc = conversion_result.document
            markdown_text = doc.export_to_markdown()
            
            if not markdown_text.strip(): return False, "No text extracted."

            # [핵심] 모든 청크의 메타데이터에 user_id 심기
            base_metadata = {
                "source": file.filename,
                "kb_id": kb_id,
                "user_id": user_id, # 👈 중요!
                "title": doc.name or file.filename,
                "uploaded_at": datetime.datetime.now().isoformat(),
            }

            markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "H1"), ("##", "H2")])
            md_header_splits = markdown_splitter.split_text(markdown_text)
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=50)
            final_splits = text_splitter.split_documents(md_header_splits)

            for idx, split in enumerate(final_splits):
                split.metadata.update(base_metadata)
                split.metadata["chunk_index"] = idx

            # 1. Vector Store 저장 (user_id 포함됨)
            texts = [split.page_content for split in final_splits]
            metadatas = [split.metadata for split in final_splits]
            await self.vector_service.add_documents(kb_id, texts, metadatas)
            
            # 2. Graph Store 저장 (user_id 포함됨)
            # 그래프는 속도가 느리므로 테스트 시 앞부분만
            subset_splits = final_splits[:3] 
            graph_documents = self.llm_transformer.convert_to_graph_documents(subset_splits)
            
            for graph_doc in graph_documents:
                # Document 노드에 유저 정보 심기
                graph_doc.source = Document(page_content="Source", metadata=base_metadata)
                
                # [고급] 모든 노드에 user_id 속성을 추가하면 좋지만, 
                # LangChain 기본 변환기로는 어려우므로 여기서는 Document 연결성만 보장
            
            self.graph_service.add_graph_documents(graph_documents)

            return True, f"File processed for User {user_id}"

        except Exception as e:
            logger.error(f"Ingestion Error: {str(e)}")
            return False, str(e)
        finally:
            if os.path.exists(file_path): os.remove(file_path)