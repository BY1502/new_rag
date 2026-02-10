"""
QdrantStore — Qdrant 벡터 DB 구현체
기존 VectorStoreService의 검색 로직을 BaseVectorStore 인터페이스로 캡슐화
"""
import logging
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient, models

from app.services.vdb.base import BaseVectorStore

logger = logging.getLogger(__name__)


class QdrantStore(BaseVectorStore):
    """Qdrant 벡터 DB 구현체"""

    def __init__(
        self,
        client: QdrantClient,
        collection_name: str,
        embeddings: Any,
        embedding_dimension: int,
        user_id: Optional[int] = None,
    ):
        """
        Args:
            client: QdrantClient 인스턴스 (내부 or 외부)
            collection_name: Qdrant 컬렉션 이름 (e.g. "kb_abc123")
            embeddings: HuggingFaceEmbeddings 인스턴스
            embedding_dimension: 임베딩 차원
            user_id: 사용자 ID (None이면 필터 없이 검색 — 외부 VDB용)
        """
        self.client = client
        self.collection_name = collection_name
        self.embeddings = embeddings
        self.embedding_dimension = embedding_dimension
        self.user_id = user_id

    def _ensure_collection(self):
        """컬렉션이 없으면 생성"""
        if not self.client.collection_exists(self.collection_name):
            logger.info(f"Creating collection: {self.collection_name}")
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.embedding_dimension,
                    distance=models.Distance.COSINE,
                ),
            )

    def _build_vector_store(self) -> QdrantVectorStore:
        """QdrantVectorStore 인스턴스 생성"""
        self._ensure_collection()
        return QdrantVectorStore(
            client=self.client,
            collection_name=self.collection_name,
            embedding=self.embeddings,
            content_payload_key="page_content",
            metadata_payload_key="metadata",
        )

    def _build_user_filter(self) -> Optional[models.Filter]:
        """user_id 기반 메타데이터 필터 (외부 VDB면 None)"""
        if self.user_id is None:
            return None
        return models.Filter(
            must=[
                models.FieldCondition(
                    key="metadata.user_id",
                    match=models.MatchValue(value=self.user_id),
                )
            ]
        )

    async def search(
        self,
        query: str,
        top_k: int = 4,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """벡터 유사도 검색"""
        vs = self._build_vector_store()
        user_filter = self._build_user_filter()

        search_kwargs: Dict[str, Any] = {"k": top_k}
        if user_filter:
            search_kwargs["filter"] = user_filter

        retriever = vs.as_retriever(
            search_type="similarity",
            search_kwargs=search_kwargs,
        )
        return await retriever.ainvoke(query)

    async def add_documents(
        self,
        texts: List[str],
        metadatas: Optional[List[dict]] = None,
    ) -> None:
        """문서 추가"""
        vs = self._build_vector_store()
        await vs.aadd_texts(texts=texts, metadatas=metadatas or [])
        logger.info(f"Added {len(texts)} documents to {self.collection_name}")

    def collection_exists(self, collection_name: str) -> bool:
        """컬렉션 존재 여부"""
        return self.client.collection_exists(collection_name)
