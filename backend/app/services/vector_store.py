import uuid
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

        VectorStoreService._initialized = True
        logger.info(f"VectorStoreService initialized (singleton) - device: {device}")

    def get_client(self, qdrant_client: "QdrantClient | None" = None) -> QdrantClient:
        """외부 client가 있으면 반환, 없으면 로컬 client 반환."""
        return qdrant_client or self.client

    def _create_collection(self, client: QdrantClient, collection_name: str):
        """triple vector 컬렉션 생성 (dense + clip + text-sparse)"""
        logger.info(f"Creating collection: {collection_name}")
        client.create_collection(
            collection_name=collection_name,
            vectors_config={
                "dense": models.VectorParams(
                    size=self.embedding_dimension,
                    distance=models.Distance.COSINE,
                ),
                "clip": models.VectorParams(
                    size=512,  # CLIP ViT-B/32
                    distance=models.Distance.COSINE,
                )
            },
            sparse_vectors_config={
                "text-sparse": models.SparseVectorParams(
                    index=models.SparseIndexParams(on_disk=False)
                )
            },
        )

    def get_retriever(self, kb_id: str, user_id: int, top_k: int = 4,
                      qdrant_client: "QdrantClient | None" = None):
        client = qdrant_client or self.client
        collection_name = f"kb_{kb_id}"

        # 컬렉션이 없으면 생성
        if not client.collection_exists(collection_name):
            self._create_collection(client, collection_name)

        vector_store = QdrantVectorStore(
            client=client,
            collection_name=collection_name,
            embedding=self.embeddings,
            vector_name="dense",
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
        """문서 추가 (dense + sparse dual vectors)"""
        client = qdrant_client or self.client
        collection_name = f"kb_{kb_id}"

        if not client.collection_exists(collection_name):
            self._create_collection(client, collection_name)

        try:
            from app.services.bm25_processor import get_bm25_processor
            from app.services.cache_service import get_cache_service
            import json

            bm25 = get_bm25_processor()
            cache = get_cache_service()

            # 기존 어휘 로드
            vocab_key = f"bm25:vocab:{collection_name}"
            vocab_json = await cache.get(vocab_key)
            vocab = json.loads(vocab_json) if vocab_json else {}

            # 새 문서로 어휘 확장
            new_vocab = bm25.build_vocabulary(texts)
            for term in new_vocab:
                if term not in vocab:
                    vocab[term] = len(vocab)
            await cache.set(vocab_key, json.dumps(vocab), ttl=0)  # 영구 저장

            # Dense embeddings
            dense_embeddings = self.embeddings.embed_documents(texts)

            # Sparse vectors (BM25)
            sparse_vectors = [bm25.compute_sparse_vector(text, vocab) for text in texts]

            # Dual vector 포인트 생성
            points = []
            for i, (text, meta, dense_emb, sparse_vec) in enumerate(
                zip(texts, metadatas, dense_embeddings, sparse_vectors)
            ):
                point_vectors = {"dense": dense_emb}
                if sparse_vec:
                    point_vectors["text-sparse"] = models.SparseVector(
                        indices=list(sparse_vec.keys()),
                        values=list(sparse_vec.values()),
                    )

                points.append(models.PointStruct(
                    id=str(uuid.uuid4()),
                    vector=point_vectors,
                    payload={"page_content": text, "metadata": meta},
                ))

            # 배치 업로드
            BATCH = 100
            for start in range(0, len(points), BATCH):
                client.upsert(collection_name=collection_name, points=points[start:start + BATCH])

            logger.info(f"Added {len(texts)} documents (dense + sparse) to {collection_name}")

        except Exception as e:
            # Sparse 실패 시 dense-only 폴백
            logger.warning(f"Dual vector indexing failed ({e}), falling back to dense-only")
            vector_store = QdrantVectorStore(
                client=client,
                collection_name=collection_name,
                embedding=self.embeddings,
                vector_name="dense",
                content_payload_key="page_content",
                metadata_payload_key="metadata",
            )
            await vector_store.aadd_texts(texts=texts, metadatas=metadatas)
            logger.info(f"Added {len(texts)} documents (dense-only fallback) to {collection_name}")


@lru_cache()
def get_vector_store_service() -> VectorStoreService:
    """싱글톤 VectorStoreService 인스턴스 반환"""
    return VectorStoreService()
