"""
HybridRetriever — 다중 VDB 소스 병렬 검색 및 결과 병합
"""
import asyncio
import logging
from typing import Any, Dict, List, Optional

from langchain_core.callbacks import CallbackManagerForRetrieverRun, AsyncCallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever

logger = logging.getLogger(__name__)


class HybridRetriever(BaseRetriever):
    """
    여러 BaseVectorStore 소스에서 병렬 검색 후 결과를 병합하는 Retriever.

    - asyncio.gather로 모든 소스를 동시에 검색
    - 실패한 소스는 warning + skip (graceful fallback)
    - content[:200] 기반 중복 제거
    - top_k로 최종 결과 제한
    """

    stores: List[Any]  # List[BaseVectorStore]
    top_k: int = 4
    search_mode: str = "hybrid"  # "dense" | "sparse" | "hybrid"

    class Config:
        arbitrary_types_allowed = True

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[AsyncCallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """비동기 다중 소스 병렬 검색 - search_mode에 따라 적절한 메서드 호출"""
        tasks = []
        for store in self.stores:
            if self.search_mode == "hybrid" and hasattr(store, "hybrid_search"):
                tasks.append(store.hybrid_search(query, top_k=self.top_k))
            elif self.search_mode == "sparse" and hasattr(store, "sparse_search"):
                tasks.append(store.sparse_search(query, top_k=self.top_k))
            else:
                # 기본 dense search
                tasks.append(store.search(query, top_k=self.top_k))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_docs: List[Document] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(f"Source {i} search failed: {result}")
                continue
            all_docs.extend(result)

        # 중복 제거 (content[:200] 기반)
        seen = set()
        unique_docs: List[Document] = []
        for doc in all_docs:
            content_key = doc.page_content[:200]
            if content_key not in seen:
                seen.add(content_key)
                unique_docs.append(doc)

        return unique_docs[:self.top_k]

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """동기 fallback"""
        return asyncio.get_running_loop().run_until_complete(
            self._aget_relevant_documents(query)
        )
