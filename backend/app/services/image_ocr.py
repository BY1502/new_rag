"""
이미지 OCR 서비스
- EasyOCR로 이미지 내 텍스트 추출
- 다국어 지원 (한국어, 영어)
"""
import logging
from typing import List, Optional
from functools import lru_cache

logger = logging.getLogger(__name__)


class ImageOCRService:
    """이미지 OCR 서비스 (싱글톤)"""

    _instance: Optional["ImageOCRService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if ImageOCRService._initialized:
            return
        ImageOCRService._initialized = True

        self._reader = None
        logger.info("ImageOCRService initialized")

    def _load_reader(self):
        """EasyOCR Reader 지연 로딩"""
        if self._reader is not None:
            return

        try:
            import easyocr

            logger.info("Loading EasyOCR reader (ko, en)...")

            # 한국어 + 영어 지원
            self._reader = easyocr.Reader(['ko', 'en'], gpu=False)

            logger.info("EasyOCR reader loaded successfully")

        except Exception as e:
            logger.error(f"Failed to load EasyOCR reader: {e}")
            self._reader = None

    def extract_text(
        self,
        image_path: str,
        detail: int = 0,
        paragraph: bool = True,
    ) -> str:
        """
        이미지에서 텍스트 추출

        Args:
            image_path: 이미지 파일 경로
            detail: 세부 수준 (0: 빠름, 1: 정확)
            paragraph: 문단 단위로 병합 여부

        Returns:
            추출된 텍스트 (실패 시 빈 문자열)
        """
        try:
            self._load_reader()

            if self._reader is None:
                logger.warning("EasyOCR reader not available")
                return ""

            # OCR 수행
            result = self._reader.readtext(image_path, detail=detail, paragraph=paragraph)

            if not result:
                return ""

            # 텍스트만 추출
            if paragraph:
                # paragraph=True일 때는 result가 문자열
                extracted_text = result if isinstance(result, str) else ""
            else:
                # paragraph=False일 때는 result가 리스트
                texts = [item[1] for item in result if len(item) > 1]
                extracted_text = " ".join(texts)

            logger.debug(f"Extracted {len(extracted_text)} characters from {image_path}")
            return extracted_text.strip()

        except Exception as e:
            logger.error(f"OCR failed for {image_path}: {e}")
            return ""

    def extract_texts_batch(
        self,
        image_paths: List[str],
        detail: int = 0,
        paragraph: bool = True,
    ) -> List[str]:
        """
        여러 이미지에서 텍스트 배치 추출

        Args:
            image_paths: 이미지 파일 경로 리스트
            detail: 세부 수준
            paragraph: 문단 단위로 병합 여부

        Returns:
            추출된 텍스트 리스트
        """
        texts = []

        self._load_reader()

        if self._reader is None:
            logger.warning("EasyOCR reader not available, skipping OCR")
            return [""] * len(image_paths)

        for path in image_paths:
            text = self.extract_text(path, detail=detail, paragraph=paragraph)
            texts.append(text)

        logger.info(f"OCR completed for {len(texts)} images")
        return texts


@lru_cache()
def get_image_ocr_service() -> ImageOCRService:
    """싱글톤 ImageOCRService 인스턴스 반환"""
    return ImageOCRService()
