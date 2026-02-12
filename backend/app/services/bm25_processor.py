"""
BM25 Sparse Vector Processor
BM25 알고리즘을 사용하여 sparse vector를 생성합니다.
"""
import logging
from functools import lru_cache
from typing import List, Dict
from rank_bm25 import BM25Okapi

from app.core.config import settings

logger = logging.getLogger(__name__)


class BM25Processor:
    """BM25 기반 sparse vector 생성기"""

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if BM25Processor._initialized:
            return
        BM25Processor._initialized = True

        # BM25 파라미터 (Okapi BM25)
        self.k1 = getattr(settings, 'BM25_K1', 1.5)  # Term saturation (기본값: 1.5)
        self.b = getattr(settings, 'BM25_B', 0.75)   # Length normalization (기본값: 0.75)
        self.vocab_size_limit = getattr(settings, 'BM25_VOCAB_SIZE', 10000)

        logger.info(f"BM25Processor initialized (singleton) - k1={self.k1}, b={self.b}")

    def tokenize(self, text: str) -> List[str]:
        """
        텍스트를 토큰화 (한글 + 영어 지원)

        Args:
            text: 입력 텍스트

        Returns:
            토큰 리스트 (소문자 변환)
        """
        if not text:
            return []

        # 간단한 공백 기반 토큰화 + 소문자 변환
        # 향후 개선: spaCy ko_core_news_sm 사용
        tokens = text.lower().split()

        # 특수문자 제거 (선택적)
        # tokens = [re.sub(r'[^\w\s]', '', token) for token in tokens if token]

        return [t for t in tokens if t]  # 빈 토큰 제거

    def build_vocabulary(self, texts: List[str]) -> Dict[str, int]:
        """
        문서 집합의 어휘 구축 (term → index 매핑)

        Args:
            texts: 문서 텍스트 리스트

        Returns:
            어휘 사전 {term: index}
        """
        vocab = {}
        for text in texts:
            tokens = self.tokenize(text)
            for token in tokens:
                if token not in vocab:
                    vocab[token] = len(vocab)

        # 어휘 크기 제한 (상위 N개만)
        if len(vocab) > self.vocab_size_limit:
            logger.warning(
                f"Vocabulary size ({len(vocab)}) exceeds limit ({self.vocab_size_limit}). "
                "Consider using IDF-based pruning."
            )
            # 간단한 제한: 첫 N개만 유지 (실제로는 IDF 기반 필터링 권장)
            vocab = dict(list(vocab.items())[:self.vocab_size_limit])

        return vocab

    def compute_sparse_vector(
        self,
        text: str,
        vocab: Dict[str, int]
    ) -> Dict[int, float]:
        """
        BM25 기반 sparse vector 생성

        Args:
            text: 문서 텍스트
            vocab: 어휘 사전 {term: index}

        Returns:
            Sparse vector {term_index: tf_score}
        """
        if not text or not vocab:
            return {}

        tokens = self.tokenize(text)
        if not tokens:
            return {}

        # TF (Term Frequency) 계산
        sparse = {}
        doc_len = len(tokens)

        for token in set(tokens):  # 중복 제거
            if token in vocab:
                idx = vocab[token]
                tf = tokens.count(token) / doc_len  # Normalized TF
                sparse[idx] = tf

        return sparse

    def compute_bm25_scores(
        self,
        query: str,
        documents: List[str],
        vocab: Dict[str, int]
    ) -> List[float]:
        """
        BM25 점수 계산 (전체 문서 집합에 대해)

        Args:
            query: 쿼리 텍스트
            documents: 문서 리스트
            vocab: 어휘 사전

        Returns:
            각 문서의 BM25 점수 리스트
        """
        # 모든 문서 토큰화
        tokenized_docs = [self.tokenize(doc) for doc in documents]

        # BM25 모델 생성
        bm25 = BM25Okapi(tokenized_docs, k1=self.k1, b=self.b)

        # 쿼리 토큰화 및 점수 계산
        query_tokens = self.tokenize(query)
        scores = bm25.get_scores(query_tokens)

        return scores.tolist()


@lru_cache()
def get_bm25_processor() -> BM25Processor:
    """싱글톤 BM25Processor 인스턴스 반환"""
    return BM25Processor()
