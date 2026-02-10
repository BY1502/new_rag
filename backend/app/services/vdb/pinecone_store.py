"""
PineconeStore — Pinecone 벡터 DB 구현체 (선택적 의존성)
pinecone, langchain-pinecone이 설치되어 있지 않으면 ImportError로 안내
"""
import logging
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document

from app.services.vdb.base import BaseVectorStore

logger = logging.getLogger(__name__)

try:
    from pinecone import Pinecone
    from langchain_pinecone import PineconeVectorStore
    PINECONE_AVAILABLE = True
except ImportError:
    PINECONE_AVAILABLE = False


class PineconeStore(BaseVectorStore):
    """Pinecone 벡터 DB 구현체"""

    def __init__(
        self,
        api_key: str,
        index_name: str,
        embeddings: Any,
        namespace: Optional[str] = None,
    ):
        if not PINECONE_AVAILABLE:
            raise ImportError(
                "Pinecone dependencies not installed. "
                "Run: pip install pinecone langchain-pinecone"
            )

        self.api_key = api_key
        self.index_name = index_name
        self.embeddings = embeddings
        self.namespace = namespace

        self._pc = Pinecone(api_key=api_key)
        self._index = self._pc.Index(index_name)

    def _build_vector_store(self) -> "PineconeVectorStore":
        """PineconeVectorStore 인스턴스 생성"""
        return PineconeVectorStore(
            index=self._index,
            embedding=self.embeddings,
            namespace=self.namespace,
        )

    async def search(
        self,
        query: str,
        top_k: int = 4,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """벡터 유사도 검색"""
        vs = self._build_vector_store()
        search_kwargs: Dict[str, Any] = {"k": top_k}
        if filters:
            search_kwargs["filter"] = filters

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
        logger.info(f"Added {len(texts)} documents to Pinecone index '{self.index_name}'")

    def collection_exists(self, collection_name: str) -> bool:
        """인덱스 존재 여부 확인"""
        try:
            indexes = self._pc.list_indexes()
            return any(idx.name == collection_name for idx in indexes)
        except Exception as e:
            logger.warning(f"Failed to check Pinecone index: {e}")
            return False
