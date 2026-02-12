"""
이미지 OCR (광학 문자 인식) 서비스

- EasyOCR을 사용하여 이미지 내 텍스트 자동 추출
- 다국어 지원 (한국어, 영어)
- 스크린샷, 스캔 문서, 차트 내 텍스트 인식
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
        logger.info("[OCR] 초기화 완료 - EasyOCR 준비")

    def _load_reader(self):
        """
        EasyOCR Reader 지연 로딩 (첫 사용 시에만 메모리에 로드)

        한국어와 영어 언어 모델을 동시에 로드합니다.
        GPU를 사용하면 속도가 빨라지지만 CPU 모드로도 충분히 사용 가능합니다.
        """
        if self._reader is not None:
            return

        try:
            import easyocr

            logger.info("[OCR] EasyOCR Reader 로딩 시작 (한국어 + 영어)...")

            # 한국어 + 영어 지원 (CPU 모드)
            self._reader = easyocr.Reader(['ko', 'en'], gpu=False)

            logger.info("[OCR] EasyOCR Reader 로딩 완료")

        except Exception as e:
            logger.error(f"[OCR] EasyOCR Reader 로딩 실패: {e}")
            self._reader = None

    def extract_text(
        self,
        image_path: str,
        detail: int = 0,
        paragraph: bool = True,
    ) -> str:
        """
        이미지에서 텍스트 추출 (OCR)

        스크린샷, 스캔 문서, 차트 등에서 텍스트를 인식하여 추출합니다.
        추출된 텍스트는 검색 가능한 형태로 저장됩니다.

        Args:
            image_path: 이미지 파일 경로 (JPG, PNG 등)
            detail: 세부 수준 (0: 빠른 인식, 1: 정확한 인식)
            paragraph: 문단 단위로 병합 여부 (True: 가독성 향상)

        Returns:
            추출된 텍스트 문자열 (실패 시 빈 문자열)
        """
        try:
            self._load_reader()

            if self._reader is None:
                logger.warning("[OCR] EasyOCR Reader 사용 불가 - OCR 건너뜀")
                return ""

            logger.debug(f"[OCR] 텍스트 추출 시작: {image_path}")

            # OCR 수행 (텍스트 인식 및 추출)
            result = self._reader.readtext(image_path, detail=detail, paragraph=paragraph)

            if not result:
                logger.debug(f"[OCR] 텍스트 없음: {image_path}")
                return ""

            # 텍스트만 추출
            if paragraph:
                # paragraph=True일 때는 result가 문자열
                extracted_text = result if isinstance(result, str) else ""
            else:
                # paragraph=False일 때는 result가 리스트 (bbox, text, confidence)
                texts = [item[1] for item in result if len(item) > 1]
                extracted_text = " ".join(texts)

            logger.debug(f"[OCR] 텍스트 추출 완료: {len(extracted_text)}자")
            return extracted_text.strip()

        except Exception as e:
            logger.error(f"[OCR] 텍스트 추출 실패 ({image_path}): {e}")
            return ""

    def extract_texts_batch(
        self,
        image_paths: List[str],
        detail: int = 0,
        paragraph: bool = True,
    ) -> List[str]:
        """
        여러 이미지에서 텍스트 배치 추출

        여러 이미지를 순차적으로 처리하여 텍스트를 추출합니다.
        대량의 스크린샷이나 스캔 문서를 처리할 때 유용합니다.

        Args:
            image_paths: 이미지 파일 경로 리스트
            detail: 세부 수준 (0: 빠름, 1: 정확)
            paragraph: 문단 단위로 병합 여부

        Returns:
            추출된 텍스트 리스트 (각 이미지당 하나씩, 순서 보장)
        """
        texts = []

        logger.info(f"[OCR] 배치 텍스트 추출 시작: {len(image_paths)}개 이미지")
        self._load_reader()

        if self._reader is None:
            logger.warning("[OCR] EasyOCR Reader 사용 불가 - OCR 건너뜀")
            return [""] * len(image_paths)

        for path in image_paths:
            text = self.extract_text(path, detail=detail, paragraph=paragraph)
            texts.append(text)

        logger.info(f"[OCR] 배치 텍스트 추출 완료: {len(texts)}개")
        return texts


@lru_cache()
def get_image_ocr_service() -> ImageOCRService:
    """
    싱글톤 ImageOCRService 인스턴스 반환

    애플리케이션 전체에서 하나의 EasyOCR Reader만 사용하여
    메모리를 절약하고 초기화 시간을 단축합니다.
    """
    return ImageOCRService()
