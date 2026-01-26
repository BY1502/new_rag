from langchain_qdrant import QdrantVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.http import models # 필터링 모델
from app.core.config import settings
import torch

class VectorStoreService:
    def __init__(self):
        self.client = QdrantClient(url=settings.QDRANT_URL)
        
        device = "cpu"
        if torch.cuda.is_available(): device = "cuda"
        elif torch.backends.mps.is_available(): device = "mps"
            
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': device},
            encode_kwargs={'normalize_embeddings': True}
        )

    def get_collection_name(self, kb_id: str):
        return f"kb_{kb_id}"

    def ensure_collection(self, collection_name: str):
        if not self.client.collection_exists(collection_name):
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(size=1024, distance=models.Distance.COSINE),
            )

    async def add_documents(self, kb_id: str, texts: list, metadatas: list):
        """
        문서 저장 시 metadata에 user_id가 반드시 포함되어 있어야 함
        """
        collection_name = self.get_collection_name(kb_id)
        self.ensure_collection(collection_name)

        vector_store = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embeddings,
        )
        
        await vector_store.aadd_texts(texts=texts, metadatas=metadatas)
        return True

    def get_retriever(self, kb_id: str, user_id: int, k: int = 4):
        """
        [핵심] 유저 ID로 필터링된 Retriever 반환
        """
        collection_name = self.get_collection_name(kb_id)
        
        vector_store = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embeddings,
        )
        
        # Qdrant 필터 조건: metadata.user_id == current_user_id
        user_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="metadata.user_id",
                    match=models.MatchValue(value=user_id)
                )
            ]
        )
        
        return vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": k, "filter": user_filter}
        )