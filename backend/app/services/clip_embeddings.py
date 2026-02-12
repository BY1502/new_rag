"""
CLIP Embedding Service
- Image embedding (CLIP image encoder)
- Text embedding for cross-modal search (CLIP text encoder)
- Singleton pattern with device detection
"""
import logging
from functools import lru_cache
from typing import List
from pathlib import Path

import torch
from PIL import Image

logger = logging.getLogger(__name__)


class ClipEmbeddings:
    """CLIP 임베딩 서비스 (싱글톤)"""

    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if ClipEmbeddings._initialized:
            return
        ClipEmbeddings._initialized = True

        # Device detection (same as BGE)
        self.device = self._get_device()

        # Lazy loading
        self._model = None
        self._processor = None
        self._clip_available = None

        logger.info(f"[CLIP] 초기화 완료 - 사용 디바이스: {self.device}")

    @staticmethod
    def _get_device() -> str:
        """사용 가능한 디바이스 반환"""
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    @property
    def clip_available(self) -> bool:
        """CLIP 모델 사용 가능 여부 확인"""
        if self._clip_available is None:
            try:
                from transformers import CLIPModel, CLIPProcessor
                self._clip_available = True
            except ImportError:
                logger.error("transformers library not installed. Install with: pip install transformers")
                self._clip_available = False
        return self._clip_available

    @property
    def model(self):
        """CLIP 모델 (지연 로딩)"""
        if not self.clip_available:
            raise RuntimeError("CLIP model not available. Install transformers library.")

        if self._model is None:
            try:
                from transformers import CLIPModel
                from app.core.config import settings

                logger.info(f"[CLIP] 모델 로딩 시작: {settings.CLIP_MODEL}")
                self._model = CLIPModel.from_pretrained(settings.CLIP_MODEL).to(self.device)
                self._model.eval()
                logger.info(f"[CLIP] 모델 로딩 완료 - 디바이스: {self.device}, 차원: 512")
            except Exception as e:
                logger.error(f"[CLIP] 모델 로딩 실패: {e}")
                raise

        return self._model

    @property
    def processor(self):
        """CLIP 프로세서 (지연 로딩)"""
        if not self.clip_available:
            raise RuntimeError("CLIP processor not available. Install transformers library.")

        if self._processor is None:
            try:
                from transformers import CLIPProcessor
                from app.core.config import settings

                self._processor = CLIPProcessor.from_pretrained(settings.CLIP_MODEL)
            except Exception as e:
                logger.error(f"[CLIP] 프로세서 로딩 실패: {e}")
                raise

        return self._processor

    def embed_image(self, image_path: str) -> List[float]:
        """
        단일 이미지를 CLIP으로 임베딩

        이 메서드는 이미지 파일을 512차원 벡터로 변환합니다.
        텍스트-이미지 크로스 모달 검색에 사용됩니다.

        Args:
            image_path: 이미지 파일 경로 (JPG, PNG 등)

        Returns:
            512-dim CLIP embedding vector (정규화됨)
        """
        try:
            logger.debug(f"[CLIP] 이미지 임베딩 시작: {Path(image_path).name}")

            # 이미지 로드 및 RGB 변환
            image = Image.open(image_path).convert("RGB")
            inputs = self.processor(images=image, return_tensors="pt").to(self.device)

            # CLIP 이미지 인코더를 통해 특징 추출
            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)
                # L2 정규화 (코사인 유사도 계산용)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            logger.debug(f"[CLIP] 이미지 임베딩 완료: 512-dim vector")
            return image_features.cpu().numpy()[0].tolist()

        except Exception as e:
            logger.error(f"[CLIP] 이미지 임베딩 실패 ({Path(image_path).name}): {e}")
            raise

    def embed_images(self, image_paths: List[str]) -> List[List[float]]:
        """
        여러 이미지를 배치로 임베딩 (성능 최적화)

        배치 처리를 통해 GPU 활용도를 높이고 속도를 향상시킵니다.

        Args:
            image_paths: 이미지 파일 경로 리스트

        Returns:
            List of 512-dim CLIP embedding vectors (각 이미지당 하나)
        """
        try:
            logger.info(f"[CLIP] 배치 이미지 임베딩 시작: {len(image_paths)}개")

            # 이미지 로드 (실패한 이미지는 건너뜀)
            images = []
            for path in image_paths:
                try:
                    img = Image.open(path).convert("RGB")
                    images.append(img)
                except Exception as e:
                    logger.warning(f"[CLIP] 이미지 로드 실패 ({Path(path).name}): {e}, 건너뜀")
                    continue

            if not images:
                logger.warning("[CLIP] 유효한 이미지가 없습니다")
                return []

            # 배치 처리로 모든 이미지를 한 번에 임베딩
            inputs = self.processor(images=images, return_tensors="pt").to(self.device)

            with torch.no_grad():
                features = self.model.get_image_features(**inputs)
                # L2 정규화
                features = features / features.norm(dim=-1, keepdim=True)

            logger.info(f"[CLIP] 배치 임베딩 완료: {len(images)}개 → {features.shape}")
            return features.cpu().numpy().tolist()

        except Exception as e:
            logger.error(f"[CLIP] 배치 이미지 임베딩 실패: {e}")
            raise

    def embed_text_for_cross_modal(self, text: str) -> List[float]:
        """
        텍스트를 CLIP으로 임베딩 (이미지-텍스트 크로스 모달 검색용)

        텍스트 쿼리로 관련 이미지를 검색하거나,
        이미지와 텍스트의 유사도를 계산할 때 사용합니다.

        Args:
            text: 텍스트 문자열 (예: "a cat sitting on a couch")

        Returns:
            512-dim CLIP text embedding vector (이미지 벡터와 동일 공간)
        """
        try:
            logger.debug(f"[CLIP] 텍스트 임베딩 시작: '{text[:50]}...'")

            # 텍스트 토큰화 및 인코딩
            inputs = self.processor(text=[text], return_tensors="pt", padding=True, truncation=True).to(self.device)

            # CLIP 텍스트 인코더를 통해 특징 추출
            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
                # L2 정규화 (이미지 벡터와 동일한 정규화)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            logger.debug(f"[CLIP] 텍스트 임베딩 완료: 512-dim vector")
            return text_features.cpu().numpy()[0].tolist()

        except Exception as e:
            logger.error(f"[CLIP] 텍스트 임베딩 실패: {e}")
            raise

    def embed_texts_for_cross_modal(self, texts: List[str]) -> List[List[float]]:
        """
        배치 텍스트 임베딩 (크로스 모달 검색용)

        Args:
            texts: 텍스트 문자열 리스트

        Returns:
            List of 512-dim CLIP text embedding vectors
        """
        try:
            if not texts:
                return []

            inputs = self.processor(text=texts, return_tensors="pt", padding=True, truncation=True, max_length=77).to(self.device)

            with torch.no_grad():
                features = self.model.get_text_features(**inputs)
                # Normalize
                features = features / features.norm(dim=-1, keepdim=True)

            return features.cpu().numpy().tolist()

        except Exception as e:
            logger.error(f"Failed to embed texts: {e}")
            raise


@lru_cache()
def get_clip_embeddings() -> ClipEmbeddings:
    """싱글톤 ClipEmbeddings 인스턴스 반환"""
    return ClipEmbeddings()
