"""
이미지 캡셔닝 서비스
- BLIP 모델로 이미지 자동 설명 생성
- 멀티모달 검색 품질 향상
"""
import logging
from typing import List, Optional
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)


class ImageCaptioningService:
    """이미지 캡셔닝 서비스 (싱글톤)"""

    _instance: Optional["ImageCaptioningService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if ImageCaptioningService._initialized:
            return
        ImageCaptioningService._initialized = True

        self._processor = None
        self._model = None
        self._device = self._get_device()
        logger.info(f"ImageCaptioningService initialized (device: {self._device})")

    @staticmethod
    def _get_device() -> str:
        """사용 가능한 디바이스 반환"""
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"

    def _load_model(self):
        """BLIP 모델 지연 로딩"""
        if self._model is not None:
            return

        try:
            from transformers import BlipProcessor, BlipForConditionalGeneration
            import torch

            logger.info("Loading BLIP captioning model...")

            # BLIP base 모델 (가볍고 빠름)
            model_name = "Salesforce/blip-image-captioning-base"

            self._processor = BlipProcessor.from_pretrained(model_name)
            self._model = BlipForConditionalGeneration.from_pretrained(model_name)

            # 디바이스로 이동
            if self._device != "cpu":
                self._model = self._model.to(self._device)

            # 평가 모드
            self._model.eval()

            logger.info(f"BLIP model loaded successfully on {self._device}")

        except Exception as e:
            logger.error(f"Failed to load BLIP model: {e}")
            self._model = None
            self._processor = None

    def generate_caption(
        self,
        image_path: str,
        max_length: int = 50,
        min_length: int = 10,
    ) -> str:
        """
        이미지에 대한 캡션 생성

        Args:
            image_path: 이미지 파일 경로
            max_length: 최대 캡션 길이
            min_length: 최소 캡션 길이

        Returns:
            생성된 캡션 (실패 시 빈 문자열)
        """
        try:
            self._load_model()

            if self._model is None or self._processor is None:
                logger.warning("BLIP model not available")
                return ""

            from PIL import Image
            import torch

            # 이미지 로드
            image = Image.open(image_path).convert("RGB")

            # 전처리
            inputs = self._processor(image, return_tensors="pt")

            # 디바이스로 이동
            if self._device != "cpu":
                inputs = {k: v.to(self._device) for k, v in inputs.items()}

            # 캡션 생성
            with torch.no_grad():
                output = self._model.generate(
                    **inputs,
                    max_length=max_length,
                    min_length=min_length,
                    num_beams=5,
                    early_stopping=True,
                )

            # 디코딩
            caption = self._processor.decode(output[0], skip_special_tokens=True)

            logger.debug(f"Generated caption: {caption}")
            return caption.strip()

        except Exception as e:
            logger.error(f"Caption generation failed for {image_path}: {e}")
            return ""

    def generate_captions_batch(
        self,
        image_paths: List[str],
        max_length: int = 50,
        min_length: int = 10,
        batch_size: int = 4,
    ) -> List[str]:
        """
        여러 이미지에 대한 캡션 배치 생성

        Args:
            image_paths: 이미지 파일 경로 리스트
            max_length: 최대 캡션 길이
            min_length: 최소 캡션 길이
            batch_size: 배치 크기

        Returns:
            생성된 캡션 리스트
        """
        captions = []

        try:
            self._load_model()

            if self._model is None or self._processor is None:
                logger.warning("BLIP model not available, skipping captions")
                return [""] * len(image_paths)

            from PIL import Image
            import torch

            # 배치 단위로 처리
            for i in range(0, len(image_paths), batch_size):
                batch_paths = image_paths[i:i + batch_size]
                batch_images = []

                # 이미지 로드
                for path in batch_paths:
                    try:
                        img = Image.open(path).convert("RGB")
                        batch_images.append(img)
                    except Exception as e:
                        logger.warning(f"Failed to load image {path}: {e}")
                        batch_images.append(None)

                # 유효한 이미지만 처리
                valid_images = [img for img in batch_images if img is not None]
                if not valid_images:
                    captions.extend([""] * len(batch_images))
                    continue

                # 전처리
                inputs = self._processor(valid_images, return_tensors="pt", padding=True)

                # 디바이스로 이동
                if self._device != "cpu":
                    inputs = {k: v.to(self._device) for k, v in inputs.items()}

                # 캡션 생성
                with torch.no_grad():
                    outputs = self._model.generate(
                        **inputs,
                        max_length=max_length,
                        min_length=min_length,
                        num_beams=5,
                        early_stopping=True,
                    )

                # 디코딩
                batch_captions = self._processor.batch_decode(outputs, skip_special_tokens=True)

                # 결과 매핑
                caption_idx = 0
                for img in batch_images:
                    if img is not None:
                        captions.append(batch_captions[caption_idx].strip())
                        caption_idx += 1
                    else:
                        captions.append("")

            logger.info(f"Generated {len(captions)} captions")
            return captions

        except Exception as e:
            logger.error(f"Batch caption generation failed: {e}")
            return [""] * len(image_paths)


@lru_cache()
def get_image_captioning_service() -> ImageCaptioningService:
    """싱글톤 ImageCaptioningService 인스턴스 반환"""
    return ImageCaptioningService()
