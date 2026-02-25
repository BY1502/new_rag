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
        logger.info(f"[BLIP] 초기화 완료 - 사용 디바이스: {self._device}")

    @staticmethod
    def _get_device() -> str:
        """GPU 여유 메모리 확인 후 디바이스 자동 결정"""
        try:
            from app.core.device import get_device
            return get_device(model_name="Salesforce/blip-image-captioning-base")
        except Exception:
            return "cpu"

    def _load_model(self):
        """
        BLIP 모델 지연 로딩 (첫 사용 시에만 메모리에 로드)

        Salesforce BLIP-base 모델 사용:
        - 이미지 → 자연어 설명 자동 생성
        - 멀티모달 검색 품질 향상에 기여
        """
        if self._model is not None:
            return

        try:
            from transformers import BlipProcessor, BlipForConditionalGeneration
            import torch

            logger.info("[BLIP] 모델 로딩 시작: Salesforce/blip-image-captioning-base")

            # BLIP base 모델 (가볍고 빠름)
            model_name = "Salesforce/blip-image-captioning-base"

            self._processor = BlipProcessor.from_pretrained(model_name)
            self._model = BlipForConditionalGeneration.from_pretrained(model_name)

            # 디바이스로 이동
            if self._device != "cpu":
                self._model = self._model.to(self._device)

            # 평가 모드
            self._model.eval()

            logger.info(f"[BLIP] 모델 로딩 완료 - 디바이스: {self._device}")

        except Exception as e:
            logger.error(f"[BLIP] 모델 로딩 실패: {e}")
            self._model = None
            self._processor = None

    def generate_caption(
        self,
        image_path: str,
        max_length: int = 50,
        min_length: int = 10,
    ) -> str:
        """
        단일 이미지에 대한 자연어 캡션 생성

        이미지를 BLIP 모델에 입력하여 자동으로 설명을 생성합니다.
        예: "a cat sitting on a couch", "a person riding a bike"

        생성된 캡션은 텍스트 임베딩과 함께 저장되어
        텍스트 쿼리로도 이미지를 검색할 수 있게 합니다.

        Args:
            image_path: 이미지 파일 경로 (JPG, PNG 등)
            max_length: 최대 캡션 길이 (토큰 단위)
            min_length: 최소 캡션 길이 (토큰 단위)

        Returns:
            생성된 영어 캡션 문자열 (실패 시 빈 문자열)
        """
        try:
            self._load_model()

            if self._model is None or self._processor is None:
                logger.warning("[BLIP] 모델 사용 불가 - 캡션 생성 건너뜀")
                return ""

            from PIL import Image
            import torch

            # 이미지 로드 및 RGB 변환
            image = Image.open(image_path).convert("RGB")
            logger.debug(f"[BLIP] 캡션 생성 시작: {Path(image_path).name}")

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

            logger.debug(f"[BLIP] 캡션 생성 완료: \"{caption}\"")
            return caption.strip()

        except Exception as e:
            logger.error(f"[BLIP] 캡션 생성 실패 ({Path(image_path).name}): {e}")
            return ""

    def generate_captions_batch(
        self,
        image_paths: List[str],
        max_length: int = 50,
        min_length: int = 10,
        batch_size: int = 4,
    ) -> List[str]:
        """
        여러 이미지에 대한 캡션 배치 생성 (성능 최적화)

        배치 처리를 통해 GPU 활용도를 높이고 속도를 향상시킵니다.
        여러 이미지를 한 번에 모델에 입력하여 추론 시간을 단축합니다.

        Args:
            image_paths: 이미지 파일 경로 리스트
            max_length: 최대 캡션 길이 (토큰 단위)
            min_length: 최소 캡션 길이 (토큰 단위)
            batch_size: 배치 크기 (GPU 메모리에 따라 조정)

        Returns:
            생성된 캡션 리스트 (각 이미지당 하나씩, 순서 보장)
        """
        captions = []

        try:
            logger.info(f"[BLIP] 배치 캡션 생성 시작: {len(image_paths)}개 이미지")
            self._load_model()

            if self._model is None or self._processor is None:
                logger.warning("[BLIP] 모델 사용 불가 - 캡션 생성 건너뜀")
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
                        logger.warning(f"[BLIP] 이미지 로드 실패 ({Path(path).name}): {e}, 건너뜀")
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

            logger.info(f"[BLIP] 배치 캡션 생성 완료: {len(captions)}개")
            return captions

        except Exception as e:
            logger.error(f"[BLIP] 배치 캡션 생성 실패: {e}")
            return [""] * len(image_paths)


@lru_cache()
def get_image_captioning_service() -> ImageCaptioningService:
    """
    싱글톤 ImageCaptioningService 인스턴스 반환

    애플리케이션 전체에서 하나의 BLIP 모델 인스턴스만 사용하여
    메모리를 절약하고 초기화 시간을 단축합니다.
    """
    return ImageCaptioningService()
