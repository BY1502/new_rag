"""
RetrieverFactory — Multi-Source Retriever 라우팅

검색 소스 우선순위:
  Source A: 내부 시스템 Qdrant (항상)
  Source B: KB별 외부 Qdrant (KB.external_service_id 있으면)
  Source C: 사용자 기본 외부 VDB (ExternalService.is_default=True)

stores가 1개면 단일 retriever, 2+개면 HybridRetriever (asyncio.gather 병렬 검색)
"""
import logging
from functools import lru_cache
from typing import Optional

from langchain_core.retrievers import BaseRetriever
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.vector_store import get_vector_store_service
from app.services.qdrant_resolver import resolve_qdrant_client
from app.services.vdb.qdrant_store import QdrantStore
from app.services.vdb.hybrid_retriever import HybridRetriever
from app.services.vdb.base import BaseVectorStore
from app.crud.external_service import list_external_services, get_decrypted_service

logger = logging.getLogger(__name__)

# VDB 서비스 타입
_VDB_SERVICE_TYPES = {"qdrant", "pinecone"}


class RetrieverFactory:
    """Multi-Source Retriever Factory (싱글톤)"""

    _instance: Optional["RetrieverFactory"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if RetrieverFactory._initialized:
            return
        RetrieverFactory._initialized = True

        self.vector_service = get_vector_store_service()
        logger.info("RetrieverFactory initialized (singleton)")

    async def get_retriever(
        self,
        user_id: int,
        kb_id: str,
        top_k: int = 4,
        db: Optional[AsyncSession] = None,
        search_mode: str = "hybrid",
        dense_weight: float = 0.5,
    ) -> BaseRetriever:
        """
        KB + 사용자 설정에 따른 Retriever 반환.

        Args:
            search_mode: "dense" (의미 검색), "sparse" (키워드 검색), "hybrid" (융합 검색)
            dense_weight: 하이브리드 검색 시 Dense 비율 (0.0~1.0)

        Returns:
            단일 소스면 VectorStoreRetrieverAdapter,
            다중 소스면 HybridRetriever
        """
        stores: list[BaseVectorStore] = []

        # Source A: 내부 시스템 Qdrant (항상)
        internal = QdrantStore(
            client=self.vector_service.client,
            collection_name=f"kb_{kb_id}",
            embeddings=self.vector_service.embeddings,
            embedding_dimension=self.vector_service.embedding_dimension,
            user_id=user_id,
        )
        stores.append(internal)

        # Source B: KB별 외부 Qdrant (기존 qdrant_resolver 사용)
        if db:
            try:
                ext_client = await resolve_qdrant_client(db, user_id, kb_id)
                if ext_client:
                    external_kb = QdrantStore(
                        client=ext_client,
                        collection_name=f"kb_{kb_id}",
                        embeddings=self.vector_service.embeddings,
                        embedding_dimension=self.vector_service.embedding_dimension,
                        user_id=None,  # 외부 VDB는 필터 없이 검색
                    )
                    stores.append(external_kb)
            except Exception as e:
                logger.warning(f"Source B (KB external Qdrant) failed: {e}")

        # Source C: 사용자 기본 외부 VDB (is_default=True)
        if db:
            try:
                user_vdb = await self._resolve_user_default_vdb(user_id, db)
                if user_vdb:
                    stores.append(user_vdb)
            except Exception as e:
                logger.warning(f"Source C (user default VDB) failed: {e}")

        # 검색 메서드 결정
        if search_mode == "sparse":
            retriever_method = "sparse_search"
        elif search_mode == "hybrid":
            retriever_method = "hybrid_search"
        else:  # dense
            retriever_method = "search"

        # 1개면 단일 retriever, 2+개면 HybridRetriever
        if len(stores) == 1:
            return stores[0].as_retriever(top_k=top_k, search_method=retriever_method, alpha=dense_weight)

        logger.info(f"HybridRetriever with {len(stores)} sources for KB '{kb_id}' (mode: {search_mode})")
        return HybridRetriever(stores=stores, top_k=top_k, search_mode=search_mode, dense_weight=dense_weight)

    async def _resolve_user_default_vdb(
        self,
        user_id: int,
        db: AsyncSession,
    ) -> Optional[BaseVectorStore]:
        """
        사용자의 기본 외부 VDB 서비스 (is_default=True + VDB 타입)를 찾아
        적절한 BaseVectorStore 인스턴스를 반환.
        """
        services = await list_external_services(db, user_id)
        default_vdb = None
        for svc in services:
            if svc.is_default and svc.service_type in _VDB_SERVICE_TYPES:
                default_vdb = svc
                break

        if not default_vdb:
            return None

        # 복호화된 서비스 정보 조회
        svc_data = await get_decrypted_service(db, user_id, default_vdb.service_id)
        if not svc_data:
            return None

        svc_type = svc_data.get("service_type")

        if svc_type == "qdrant":
            return self._build_qdrant_store(svc_data)
        elif svc_type == "pinecone":
            return self._build_pinecone_store(svc_data)

        logger.warning(f"Unknown VDB service type: {svc_type}")
        return None

    def _build_qdrant_store(self, svc_data: dict) -> Optional[QdrantStore]:
        """외부 Qdrant 서비스로 QdrantStore 생성"""
        try:
            from qdrant_client import QdrantClient

            url = svc_data.get("url", "")
            api_key = svc_data.get("api_key")
            client = QdrantClient(url=url, api_key=api_key, timeout=10)
            client.get_collections()  # 연결 테스트

            return QdrantStore(
                client=client,
                collection_name="default",  # 사용자 기본 VDB는 collection 이름이 고정되지 않음
                embeddings=self.vector_service.embeddings,
                embedding_dimension=self.vector_service.embedding_dimension,
                user_id=None,
            )
        except Exception as e:
            logger.warning(f"Failed to build Qdrant store from external service: {e}")
            return None

    def _build_pinecone_store(self, svc_data: dict) -> Optional[BaseVectorStore]:
        """외부 Pinecone 서비스로 PineconeStore 생성"""
        try:
            from app.services.vdb.pinecone_store import PineconeStore, PINECONE_AVAILABLE

            if not PINECONE_AVAILABLE:
                logger.warning("Pinecone not installed, skipping user default Pinecone VDB")
                return None

            api_key = svc_data.get("api_key", "")
            index_name = svc_data.get("database", "")  # index_name을 database 필드에 저장
            if not api_key or not index_name:
                logger.warning("Pinecone requires api_key and index_name (database field)")
                return None

            return PineconeStore(
                api_key=api_key,
                index_name=index_name,
                embeddings=self.vector_service.embeddings,
            )
        except Exception as e:
            logger.warning(f"Failed to build Pinecone store: {e}")
            return None


@lru_cache()
def get_retriever_factory() -> RetrieverFactory:
    """싱글톤 RetrieverFactory 인스턴스 반환"""
    return RetrieverFactory()
