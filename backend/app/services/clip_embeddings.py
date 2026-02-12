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

        logger.info(f"ClipEmbeddings initialized - device: {self.device}")

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

                logger.info(f"Loading CLIP model: {settings.CLIP_MODEL}")
                self._model = CLIPModel.from_pretrained(settings.CLIP_MODEL).to(self.device)
                self._model.eval()
                logger.info("CLIP model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load CLIP model: {e}")
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
                logger.error(f"Failed to load CLIP processor: {e}")
                raise

        return self._processor

    def embed_image(self, image_path: str) -> List[float]:
        """
        단일 이미지 임베딩

        Args:
            image_path: 이미지 파일 경로

        Returns:
            512-dim CLIP embedding vector
        """
        try:
            image = Image.open(image_path).convert("RGB")
            inputs = self.processor(images=image, return_tensors="pt").to(self.device)

            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)
                # Normalize
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            return image_features.cpu().numpy()[0].tolist()

        except Exception as e:
            logger.error(f"Failed to embed image {image_path}: {e}")
            raise

    def embed_images(self, image_paths: List[str]) -> List[List[float]]:
        """
        배치 이미지 임베딩

        Args:
            image_paths: 이미지 파일 경로 리스트

        Returns:
            List of 512-dim CLIP embedding vectors
        """
        try:
            images = []
            for path in image_paths:
                try:
                    img = Image.open(path).convert("RGB")
                    images.append(img)
                except Exception as e:
                    logger.warning(f"Failed to load image {path}: {e}, skipping")
                    continue

            if not images:
                return []

            inputs = self.processor(images=images, return_tensors="pt").to(self.device)

            with torch.no_grad():
                features = self.model.get_image_features(**inputs)
                # Normalize
                features = features / features.norm(dim=-1, keepdim=True)

            return features.cpu().numpy().tolist()

        except Exception as e:
            logger.error(f"Failed to embed images: {e}")
            raise

    def embed_text_for_cross_modal(self, text: str) -> List[float]:
        """
        단일 텍스트 임베딩 (크로스 모달 검색용)

        Args:
            text: 텍스트 문자열

        Returns:
            512-dim CLIP text embedding vector
        """
        try:
            inputs = self.processor(text=[text], return_tensors="pt", padding=True, truncation=True).to(self.device)

            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
                # Normalize
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            return text_features.cpu().numpy()[0].tolist()

        except Exception as e:
            logger.error(f"Failed to embed text: {e}")
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
