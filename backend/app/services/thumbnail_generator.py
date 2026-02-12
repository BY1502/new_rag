"""
썸네일 생성 서비스

- 이미지 미리보기용 썸네일 생성 (300x300 기본 크기)
- 웹 전송 최적화 (JPEG 압축, 파일 크기 감소)
- 비율 유지하며 리사이징 (이미지 왜곡 방지)
"""
import logging
from typing import Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


class ThumbnailGenerator:
    """썸네일 생성 서비스 (싱글톤)"""

    _instance: Optional["ThumbnailGenerator"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def generate_thumbnail(
        self,
        image_path: str,
        max_size: Tuple[int, int] = (300, 300),
        quality: int = 85,
    ) -> Optional[str]:
        """
        이미지 썸네일 생성 (비율 유지하며 리사이징)

        원본 이미지를 작은 크기로 축소하여 웹에서 빠르게 로드할 수 있도록 합니다.
        가로/세로 비율을 유지하며 max_size 내로 축소합니다.

        처리 과정:
        1. 원본 이미지 로드
        2. RGB 모드로 변환 (투명도 처리)
        3. LANCZOS 리샘플링으로 고품질 축소
        4. JPEG 형식으로 압축 저장

        Args:
            image_path: 원본 이미지 경로 (JPG, PNG 등)
            max_size: 최대 크기 (width, height) - 비율 유지
            quality: JPEG 압축 품질 (1-100, 85 권장)

        Returns:
            썸네일 파일 경로 (원본과 같은 폴더에 _thumb 접미사로 저장)
            실패 시 None 반환
        """
        try:
            from PIL import Image

            path_obj = Path(image_path)
            logger.debug(f"[썸네일] 생성 시작: {path_obj.name}")

            # 썸네일 파일명 생성 (원본명_thumb.jpg)
            thumb_name = f"{path_obj.stem}_thumb{path_obj.suffix}"
            thumb_path = path_obj.parent / thumb_name

            # 이미지 로드
            img = Image.open(image_path)
            original_size = img.size

            # RGB로 변환 (투명도가 있는 PNG → JPEG 변환 대비)
            if img.mode in ("RGBA", "LA", "P"):
                # 흰색 배경 생성
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                # 투명도 처리하여 배경에 합성
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # 썸네일 생성 (비율 유지하며 축소)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            new_size = img.size

            # JPEG 형식으로 저장 (압축 최적화)
            img.save(
                str(thumb_path),
                format="JPEG",
                quality=quality,
                optimize=True,
            )

            # 파일 크기 확인
            original_kb = Path(image_path).stat().st_size / 1024
            thumb_kb = thumb_path.stat().st_size / 1024

            logger.debug(
                f"[썸네일] 생성 완료: {path_obj.name} "
                f"({original_size[0]}x{original_size[1]} {original_kb:.1f}KB → "
                f"{new_size[0]}x{new_size[1]} {thumb_kb:.1f}KB)"
            )
            return str(thumb_path)

        except Exception as e:
            logger.error(f"[썸네일] 생성 실패 ({Path(image_path).name}): {e}")
            return None

    def generate_thumbnails_batch(
        self,
        image_paths: list,
        max_size: Tuple[int, int] = (300, 300),
        quality: int = 85,
    ) -> list:
        """
        여러 이미지의 썸네일 배치 생성

        대량의 이미지를 순차적으로 처리하여 썸네일을 생성합니다.
        각 이미지는 독립적으로 처리되어 일부 실패해도 나머지는 계속 처리됩니다.

        Args:
            image_paths: 이미지 파일 경로 리스트
            max_size: 최대 크기 (width, height)
            quality: JPEG 압축 품질 (1-100)

        Returns:
            썸네일 파일 경로 리스트 (각 이미지당 하나씩, 실패 시 None)
        """
        thumbnails = []

        logger.info(f"[썸네일] 배치 생성 시작: {len(image_paths)}개 이미지")

        for path in image_paths:
            thumb = self.generate_thumbnail(path, max_size, quality)
            thumbnails.append(thumb)

        success_count = sum(1 for t in thumbnails if t)
        logger.info(f"[썸네일] 배치 생성 완료: {success_count}/{len(image_paths)}개 성공")
        return thumbnails


def get_thumbnail_generator() -> ThumbnailGenerator:
    """
    싱글톤 ThumbnailGenerator 인스턴스 반환

    애플리케이션 전체에서 하나의 인스턴스만 사용합니다.
    (썸네일 생성기는 상태가 없으므로 싱글톤 패턴 사용)
    """
    return ThumbnailGenerator()
