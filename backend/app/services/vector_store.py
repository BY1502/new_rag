import logging
from functools import lru_cache
import torch
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient, models
from langchain_huggingface import HuggingFaceEmbeddings
from app.core.config import settings

logger = logging.getLogger(__name__)

class VectorStoreService:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if VectorStoreService._initialized:
            return
        VectorStoreService._initialized = True

        # 디바이스 감지
        device = "cpu"
        if torch.cuda.is_available():
            device = "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            device = "mps"

        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': device, 'trust_remote_code': True},
            encode_kwargs={'normalize_embeddings': True}
        )

        self.client = QdrantClient(url=settings.QDRANT_URL)

        # 임베딩 차원 확인
        try:
            self.embedding_dimension = len(self.embeddings.embed_query("test"))
        except Exception as e:
            logger.warning(f"Failed to get embedding dimension: {e}")
            self.embedding_dimension = 1024

        logger.info(f"VectorStoreService initialized (singleton) - device: {device}")

    def get_client(self, qdrant_client: "QdrantClient | None" = None) -> QdrantClient:
        """외부 client가 있으면 반환, 없으면 로컬 client 반환."""
        return qdrant_client or self.client

    def get_retriever(self, kb_id: str, user_id: int, top_k: int = 4,
                      qdrant_client: "QdrantClient | None" = None):
        client = qdrant_client or self.client
        collection_name = f"kb_{kb_id}"

        # 컬렉션이 없으면 생성
        if not client.collection_exists(collection_name):
            logger.info(f"Creating collection: {collection_name}")
            client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(
                    size=self.embedding_dimension,
                    distance=models.Distance.COSINE
                )
            )

        vector_store = QdrantVectorStore(
            client=client,
            collection_name=collection_name,
            embedding=self.embeddings,
            content_payload_key="page_content",
            metadata_payload_key="metadata"
        )

        user_filter = models.Filter(
            must=[models.FieldCondition(
                key="metadata.user_id",
                match=models.MatchValue(value=user_id)
            )]
        )

        dense_retriever = vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": top_k, "filter": user_filter}
        )

        return dense_retriever

    async def add_documents(self, kb_id: str, texts: list, metadatas: list,
                            qdrant_client: "QdrantClient | None" = None):
        client = qdrant_client or self.client
        collection_name = f"kb_{kb_id}"

        if not client.collection_exists(collection_name):
            logger.info(f"Creating collection for documents: {collection_name}")
            client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(
                    size=self.embedding_dimension,
                    distance=models.Distance.COSINE
                )
            )

        vector_store = QdrantVectorStore(
            client=client,
            collection_name=collection_name,
            embedding=self.embeddings,
            content_payload_key="page_content",
            metadata_payload_key="metadata"
        )

        await vector_store.aadd_texts(texts=texts, metadatas=metadatas)
        logger.info(f"Added {len(texts)} documents to {collection_name}")


@lru_cache()
def get_vector_store_service() -> VectorStoreService:
    """싱글톤 VectorStoreService 인스턴스 반환"""
    return VectorStoreService()
