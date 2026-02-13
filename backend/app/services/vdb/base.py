"""
BaseVectorStore — 벡터 DB 추상 인터페이스
"""
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from langchain_core.callbacks import CallbackManagerForRetrieverRun, AsyncCallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

logger = logging.getLogger(__name__)


class BaseVectorStore(ABC):
    """모든 VDB 구현체가 따르는 표준 인터페이스"""

    @abstractmethod
    async def search(
        self,
        query: str,
        top_k: int = 4,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """벡터 유사도 검색"""
        ...

    @abstractmethod
    async def add_documents(
        self,
        texts: List[str],
        metadatas: Optional[List[dict]] = None,
    ) -> None:
        """문서 추가 (임베딩 후 저장)"""
        ...

    @abstractmethod
    def collection_exists(self, collection_name: str) -> bool:
        """컬렉션 존재 여부 확인"""
        ...

    def as_retriever(
        self,
        top_k: int = 4,
        filters: Optional[Dict[str, Any]] = None,
        search_method: str = "search"
    ) -> BaseRetriever:
        """LangChain BaseRetriever로 변환"""
        return VectorStoreRetrieverAdapter(
            store=self,
            top_k=top_k,
            filters=filters,
            search_method=search_method
        )


class VectorStoreRetrieverAdapter(BaseRetriever):
    """BaseVectorStore를 LangChain BaseRetriever로 감싸는 어댑터"""

    store: Any  # BaseVectorStore (Pydantic v2에서 ABC 타입 직접 사용 불가)
    top_k: int = 4
    filters: Optional[Dict[str, Any]] = None
    search_method: str = "search"  # "search" | "hybrid_search" | "sparse_search"

    class Config:
        arbitrary_types_allowed = True

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[AsyncCallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """비동기 검색 (주 경로) - search_method에 따라 적절한 메서드 호출"""
        # 검색 메서드 선택
        if self.search_method == "hybrid_search" and hasattr(self.store, "hybrid_search"):
            return await self.store.hybrid_search(query, top_k=self.top_k, filters=self.filters)
        elif self.search_method == "sparse_search" and hasattr(self.store, "sparse_search"):
            return await self.store.sparse_search(query, top_k=self.top_k, filters=self.filters)
        else:
            # 기본 dense search
            return await self.store.search(query, top_k=self.top_k, filters=self.filters)

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """동기 검색 (fallback)"""
        return asyncio.get_running_loop().run_until_complete(
            self._aget_relevant_documents(query, run_manager=run_manager)
        )
