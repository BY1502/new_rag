"""
이미지 업로드 테스트 스크립트
- 각 단계별로 에러 확인
"""
import asyncio
import sys
from pathlib import Path


async def test_clip_loading():
    """CLIP 모델 로딩 테스트"""
    print("\n1. Testing CLIP model loading...")
    try:
        from app.services.clip_embeddings import get_clip_embeddings

        clip = get_clip_embeddings()
        print("[OK] CLIP service initialized")

        # 더미 테스트 (모델 로드 확인)
        test_path = "test.jpg"
        print("   - CLIP model will be loaded on first use")
        return True

    except Exception as e:
        print(f"[ERROR] CLIP loading failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_blip_loading():
    """BLIP 캡셔닝 모델 로딩 테스트"""
    print("\n2. Testing BLIP captioning model loading...")
    try:
        from app.services.image_captioning import get_image_captioning_service

        captioning = get_image_captioning_service()
        print("[OK] BLIP service initialized")
        print("   - BLIP model will be loaded on first use")
        return True

    except Exception as e:
        print(f"[ERROR] BLIP loading failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_ocr_loading():
    """EasyOCR 모델 로딩 테스트"""
    print("\n3. Testing EasyOCR loading...")
    try:
        from app.services.image_ocr import get_image_ocr_service

        ocr = get_image_ocr_service()
        print("[OK] OCR service initialized")
        print("   - EasyOCR model will be loaded on first use")
        return True

    except Exception as e:
        print(f"[ERROR] OCR loading failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_ingestion_service():
    """IngestionService 초기화 테스트"""
    print("\n4. Testing IngestionService...")
    try:
        from app.services.ingestion import get_ingestion_service

        svc = get_ingestion_service()
        print(f"[OK] IngestionService initialized")
        print(f"   - Upload dir: {svc.upload_dir}")
        print(f"   - Image storage dir: {svc.image_storage_dir}")

        # 디렉토리 존재 확인
        if svc.image_storage_dir.exists():
            print(f"   - Image storage directory exists")
        else:
            print(f"   - Creating image storage directory...")
            svc.image_storage_dir.mkdir(parents=True, exist_ok=True)

        return True

    except Exception as e:
        print(f"[ERROR] IngestionService failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_config():
    """설정 파일 테스트"""
    print("\n5. Testing configuration...")
    try:
        from app.core.config import settings

        print(f"[OK] Configuration loaded")
        print(f"   - Allowed extensions: {settings.allowed_extensions_list}")
        print(f"   - Max upload size: {settings.MAX_UPLOAD_SIZE_MB}MB")
        print(f"   - CLIP model: {settings.CLIP_MODEL}")
        print(f"   - Image storage: {settings.IMAGE_STORAGE_DIR}")
        print(f"   - Enable captioning: {getattr(settings, 'ENABLE_CAPTIONING', 'NOT SET')}")
        print(f"   - Enable OCR: {getattr(settings, 'ENABLE_OCR', 'NOT SET')}")
        print(f"   - Enable thumbnail: {getattr(settings, 'ENABLE_THUMBNAIL', 'NOT SET')}")

        return True

    except Exception as e:
        print(f"[ERROR] Configuration failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    print("="*60)
    print("Image Upload System Test")
    print("="*60)

    results = []

    # 테스트 실행
    results.append(("Config", await test_config()))
    results.append(("IngestionService", await test_ingestion_service()))
    results.append(("CLIP", await test_clip_loading()))
    results.append(("BLIP", await test_blip_loading()))
    results.append(("EasyOCR", await test_ocr_loading()))

    # 결과 요약
    print("\n" + "="*60)
    print("Test Results Summary")
    print("="*60)

    for name, result in results:
        status = "[OK]" if result else "[FAILED]"
        print(f"{status} {name}")

    all_passed = all(r for _, r in results)

    if all_passed:
        print("\n[SUCCESS] All tests passed!")
        print("\nYou can now upload image files to the knowledge base.")
        print("\nSupported formats: .jpg, .jpeg, .png, .gif, .webp")
    else:
        print("\n[WARNING] Some tests failed. Check the errors above.")
        print("\nTip: Install missing packages with:")
        print("  pip install -r requirements.txt")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
