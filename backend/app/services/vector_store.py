import os
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient, models
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever
from app.core.config import settings

class VectorStoreService:
    def __init__(self):
        device = "cpu"
        import torch
        if torch.cuda.is_available(): device = "cuda"
        elif torch.backends.mps.is_available(): device = "mps"

        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': device, 'trust_remote_code': True},
            encode_kwargs={'normalize_embeddings': True}
        )
        
        self.client = QdrantClient(url=settings.QDRANT_URL)
        # 임베딩 차원 확인
        try:
            self.embedding_dimension = len(self.embeddings.embed_query("test"))
        except:
            self.embedding_dimension = 1024

    def get_retriever(self, kb_id: str, user_id: int):
        collection_name = f"kb_{kb_id}"
        
        # 1. Qdrant (Dense Vector Retriever)
        if not self.client.collection_exists(collection_name):
             # 컬렉션 없으면 생성 (검색 에러 방지용 임시 생성)
             self.client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(size=self.embedding_dimension, distance=models.Distance.COSINE)
            )

        vector_store = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embeddings,
            content_payload_key="page_content",
            metadata_payload_key="metadata"
        )
        
        user_filter = models.Filter(
            must=[models.FieldCondition(key="metadata.user_id", match=models.MatchValue(value=user_id))]
        )
        
        dense_retriever = vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 4, "filter": user_filter}
        )

        # 2. BM25 (Keyword Retriever) - 하이브리드 효과
        # 주의: BM25는 메모리에 문서를 로드해야 하므로, 실제 프로덕션에서는 ElasticSearch 등을 씁니다.
        # 여기서는 "현재 검색된 문서들"을 기반으로 즉석에서 앙상블하는 방식을 사용하거나, 
        # 심플하게 Dense 검색을 강화하는 형태로 갑니다. 
        
        # (간단한 하이브리드 구현: 지금은 Dense를 메인으로 쓰되, 추후 확장을 위해 Ensemble 구조 준비)
        return dense_retriever 

    async def add_documents(self, kb_id: str, texts: list, metadatas: list):
        collection_name = f"kb_{kb_id}"
        
        if not self.client.collection_exists(collection_name):
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(
                    size=self.embedding_dimension,
                    distance=models.Distance.COSINE
                )
            )

        vector_store = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embeddings,
            content_payload_key="page_content",
            metadata_payload_key="metadata"
        )
        
        await vector_store.aadd_texts(texts=texts, metadatas=metadatas)