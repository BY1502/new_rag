"""
VLM 서비스 테스트 스크립트
이미지 캡셔닝, OCR, CLIP 임베딩을 테스트합니다.
"""
import asyncio
from pathlib import Path


async def test_vlm_services():
    """VLM 서비스들을 개별 테스트"""

    print("=" * 60)
    print("VLM Services Test")
    print("=" * 60)

    # 1. 설정 확인
    print("\n1️⃣  Config 확인...")
    from app.core.config import settings
    print(f"   ENABLE_CAPTIONING: {settings.ENABLE_CAPTIONING}")
    print(f"   ENABLE_OCR: {settings.ENABLE_OCR}")
    print(f"   ENABLE_THUMBNAIL: {settings.ENABLE_THUMBNAIL}")
    print(f"   CLIP_MODEL: {settings.CLIP_MODEL}")
    print(f"   CLIP_DIMENSION: {settings.CLIP_DIMENSION}")

    # 2. CLIP 임베딩 테스트
    print("\n2️⃣  CLIP Embeddings 테스트...")
    try:
        from app.services.clip_embeddings import get_clip_embeddings
        clip = get_clip_embeddings()
        print(f"   ✅ CLIP loaded on {clip.device}")

        # 텍스트 임베딩 테스트
        test_vec = clip.embed_text_for_cross_modal("a cat sitting on a couch")
        print(f"   ✅ Text embedding dimension: {len(test_vec)}")
    except Exception as e:
        print(f"   ❌ CLIP 실패: {e}")

    # 3. BLIP 캡셔닝 테스트
    print("\n3️⃣  BLIP Captioning 테스트...")
    try:
        from app.services.image_captioning import get_image_captioning_service
        captioner = get_image_captioning_service()
        print(f"   ✅ BLIP initialized on {captioner._device}")

        # 모델 로드 확인
        captioner._load_model()
        if captioner._model is not None:
            print(f"   ✅ BLIP model loaded successfully")
        else:
            print(f"   ⚠️  BLIP model is None (will load on first use)")
    except Exception as e:
        print(f"   ❌ BLIP 실패: {e}")

    # 4. EasyOCR 테스트
    print("\n4️⃣  EasyOCR 테스트...")
    try:
        from app.services.image_ocr import get_image_ocr_service
        ocr = get_image_ocr_service()
        print(f"   ✅ OCR initialized")

        # Reader 로드 확인
        ocr._load_reader()
        if ocr._reader is not None:
            print(f"   ✅ EasyOCR reader loaded successfully")
        else:
            print(f"   ⚠️  EasyOCR reader is None (will load on first use)")
    except Exception as e:
        print(f"   ❌ OCR 실패: {e}")

    # 5. 썸네일 생성 테스트
    print("\n5️⃣  Thumbnail Generator 테스트...")
    try:
        from app.services.thumbnail_generator import get_thumbnail_generator
        thumb_gen = get_thumbnail_generator()
        print(f"   ✅ Thumbnail generator initialized")
    except Exception as e:
        print(f"   ❌ Thumbnail 실패: {e}")

    # 6. 이미지 저장 디렉토리 확인
    print("\n6️⃣  Image Storage 확인...")
    image_dir = Path(settings.IMAGE_STORAGE_DIR)
    print(f"   경로: {image_dir}")
    print(f"   존재 여부: {image_dir.exists()}")
    if image_dir.exists():
        kb_dirs = list(image_dir.glob("kb_*"))
        print(f"   KB 폴더 수: {len(kb_dirs)}")
        if kb_dirs:
            first_kb = kb_dirs[0]
            images = list(first_kb.glob("*.png")) + list(first_kb.glob("*.jpg"))
            print(f"   예시 KB: {first_kb.name} ({len(images)}개 이미지)")

    print("\n" + "=" * 60)
    print("테스트 완료!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_vlm_services())
