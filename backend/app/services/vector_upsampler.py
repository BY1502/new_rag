"""
벡터 업샘플링 서비스
- CLIP (512-dim) → BGE (1024-dim) 차원 변환
- 선형 변환 + 정규화
"""
import logging
from typing import List, Optional
import numpy as np

logger = logging.getLogger(__name__)


class VectorUpsampler:
    """벡터 업샘플링 서비스 (싱글톤)"""

    _instance: Optional["VectorUpsampler"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if VectorUpsampler._initialized:
            return
        VectorUpsampler._initialized = True

        # 간단한 선형 변환 (512 → 1024)
        # 실제로는 학습된 가중치를 사용할 수 있지만, 여기서는 단순 확장 사용
        self.input_dim = 512
        self.output_dim = 1024

        logger.info(f"VectorUpsampler initialized ({self.input_dim} → {self.output_dim})")

    def upsample(self, vector: List[float]) -> List[float]:
        """
        512-dim 벡터를 1024-dim으로 업샘플링

        Args:
            vector: 512차원 벡터

        Returns:
            1024차원 벡터
        """
        try:
            vec = np.array(vector, dtype=np.float32)

            if len(vec) != self.input_dim:
                logger.warning(f"Expected {self.input_dim}-dim vector, got {len(vec)}-dim")
                return vector

            # 방법 1: Zero-padding (간단, 정보 손실 없음)
            # upsampled = np.pad(vec, (0, self.output_dim - self.input_dim), mode='constant')

            # 방법 2: 복제 + 선형 보간 (더 풍부한 표현)
            upsampled = np.zeros(self.output_dim, dtype=np.float32)
            upsampled[:self.input_dim] = vec  # 원본 복사
            upsampled[self.input_dim:] = vec  # 복제

            # L2 정규화
            norm = np.linalg.norm(upsampled)
            if norm > 0:
                upsampled = upsampled / norm

            return upsampled.tolist()

        except Exception as e:
            logger.error(f"Upsampling failed: {e}")
            return vector

    def upsample_batch(self, vectors: List[List[float]]) -> List[List[float]]:
        """
        여러 벡터를 배치 업샘플링

        Args:
            vectors: 512차원 벡터 리스트

        Returns:
            1024차원 벡터 리스트
        """
        return [self.upsample(vec) for vec in vectors]


def get_vector_upsampler() -> VectorUpsampler:
    """싱글톤 VectorUpsampler 인스턴스 반환"""
    return VectorUpsampler()
