"""
썸네일 생성 서비스
- 이미지 미리보기용 썸네일 생성
- 웹 전송 최적화
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
        이미지 썸네일 생성

        Args:
            image_path: 원본 이미지 경로
            max_size: 최대 크기 (width, height)
            quality: JPEG 품질 (1-100)

        Returns:
            썸네일 파일 경로 (실패 시 None)
        """
        try:
            from PIL import Image

            path_obj = Path(image_path)

            # 썸네일 파일명 생성
            thumb_name = f"{path_obj.stem}_thumb{path_obj.suffix}"
            thumb_path = path_obj.parent / thumb_name

            # 이미지 로드
            img = Image.open(image_path)

            # RGB로 변환 (RGBA → RGB)
            if img.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            # 썸네일 생성 (비율 유지)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)

            # 저장
            img.save(
                str(thumb_path),
                format="JPEG",
                quality=quality,
                optimize=True,
            )

            logger.debug(f"Thumbnail created: {thumb_path}")
            return str(thumb_path)

        except Exception as e:
            logger.error(f"Thumbnail generation failed for {image_path}: {e}")
            return None

    def generate_thumbnails_batch(
        self,
        image_paths: list,
        max_size: Tuple[int, int] = (300, 300),
        quality: int = 85,
    ) -> list:
        """
        여러 이미지의 썸네일 배치 생성

        Args:
            image_paths: 이미지 파일 경로 리스트
            max_size: 최대 크기
            quality: JPEG 품질

        Returns:
            썸네일 파일 경로 리스트 (실패 시 None)
        """
        thumbnails = []

        for path in image_paths:
            thumb = self.generate_thumbnail(path, max_size, quality)
            thumbnails.append(thumb)

        logger.info(f"Generated {sum(1 for t in thumbnails if t)} thumbnails")
        return thumbnails


def get_thumbnail_generator() -> ThumbnailGenerator:
    """싱글톤 ThumbnailGenerator 인스턴스 반환"""
    return ThumbnailGenerator()
