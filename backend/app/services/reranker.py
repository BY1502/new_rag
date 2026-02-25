"""
Cross-Encoder Reranker 서비스 (싱글톤)

BAAI/bge-reranker-v2-m3 기반 Cross-Encoder를 사용하여
query-document 쌍의 관련성을 정밀하게 평가합니다.

Bi-Encoder(BGE-m3)는 query와 document를 독립적으로 임베딩하지만,
Cross-Encoder는 두 텍스트를 함께 입력받아 더 정확한 관련성 점수를 산출합니다.
"""
import logging
from functools import lru_cache
from typing import List, Optional, Tuple

from langchain_core.documents import Document

from app.core.config import settings
from app.core.device import get_device

logger = logging.getLogger(__name__)


class RerankerService:
    """Cross-Encoder 기반 문서 리랭킹 서비스 (싱글톤)"""

    _instance: Optional["RerankerService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if RerankerService._initialized:
            return

        self.model = None
        self.model_name = getattr(settings, "RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")

        try:
            from sentence_transformers import CrossEncoder

            # GPU 여유 메모리 확인 후 디바이스 자동 결정
            device = get_device(model_name=self.model_name)

            logger.info(f"Loading Cross-Encoder reranker: {self.model_name} (device: {device})")
            self.model = CrossEncoder(
                self.model_name,
                max_length=512,
                device=device,
            )
            logger.info(f"RerankerService initialized: {self.model_name}")

        except Exception as e:
            logger.warning(f"Cross-Encoder reranker 로드 실패: {e} — 임베딩 유사도 폴백 사용")
            self.model = None

        RerankerService._initialized = True

    def rerank(
        self,
        query: str,
        documents: List[Document],
        top_k: int = 5,
    ) -> List[Document]:
        """
        Cross-Encoder로 문서를 리랭킹합니다.

        Args:
            query: 검색 쿼리
            documents: 리랭킹할 Document 리스트
            top_k: 반환할 상위 문서 수

        Returns:
            관련성 점수 기준으로 재정렬된 Document 리스트
        """
        if not documents:
            return []

        if self.model is None:
            logger.debug("Reranker 모델 없음 — 원본 순서 반환")
            return documents[:top_k]

        try:
            # query-document 쌍 생성
            pairs = [(query, doc.page_content) for doc in documents]

            # Cross-Encoder 점수 계산
            scores = self.model.predict(pairs, show_progress_bar=False)

            # 점수 기준 내림차순 정렬
            scored_docs = sorted(
                zip(scores, documents),
                key=lambda x: x[0],
                reverse=True,
            )

            reranked = [doc for _, doc in scored_docs[:top_k]]
            logger.debug(
                f"Reranked {len(documents)} → {len(reranked)} docs "
                f"(top={scored_docs[0][0]:.4f}, bottom={scored_docs[-1][0]:.4f})"
            )
            return reranked

        except Exception as e:
            logger.warning(f"Cross-Encoder rerank 실패: {e} — 원본 순서 반환")
            return documents[:top_k]

    @property
    def is_available(self) -> bool:
        """Cross-Encoder 모델 사용 가능 여부"""
        return self.model is not None


@lru_cache()
def get_reranker_service() -> RerankerService:
    """싱글톤 RerankerService 인스턴스 반환"""
    return RerankerService()
