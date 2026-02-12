"""
이미지 경로 마이그레이션 스크립트
절대 경로 → 웹 URL 경로 (/images/kb_xxx/...)로 변경
"""
import asyncio
from pathlib import Path
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue, UpdateStatus
from app.core.config import settings

async def migrate_image_paths():
    """Qdrant에 저장된 이미지 경로를 웹 URL 형식으로 변환"""
    print("🔄 이미지 경로 마이그레이션 시작...")

    # Qdrant 연결
    client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY
    )

    # 모든 컬렉션 조회
    collections = client.get_collections().collections
    print(f"📦 총 {len(collections)}개 컬렉션 발견")

    total_updated = 0

    for collection in collections:
        collection_name = collection.name
        print(f"\n처리 중: {collection_name}")

        # 이미지 타입 필터
        image_filter = Filter(
            must=[
                FieldCondition(
                    key="metadata.content_type",
                    match=MatchValue(value="image")
                )
            ]
        )

        # 이미지 포인트 조회
        offset = None
        batch_size = 100
        updated_in_collection = 0

        while True:
            results = client.scroll(
                collection_name=collection_name,
                scroll_filter=image_filter,
                limit=batch_size,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )

            points, next_offset = results

            if not points:
                break

            # 각 포인트의 경로 업데이트
            for point in points:
                payload = point.payload
                metadata = payload.get("metadata", {})

                # 절대 경로 → 웹 URL 변환
                image_path = metadata.get("image_path", "")
                thumbnail_path = metadata.get("thumbnail_path", "")

                needs_update = False
                new_metadata = metadata.copy()

                # image_path 변환
                if image_path and ("storage/images" in image_path or "backend/storage" in image_path):
                    # 예: c:/Users/.../backend/storage/images/kb_xxx/file.png → /images/kb_xxx/file.png
                    if "storage/images/" in image_path:
                        relative_path = image_path.split("storage/images/")[1]
                        new_metadata["image_path"] = f"/images/{relative_path.replace(chr(92), '/')}"
                        needs_update = True

                # thumbnail_path 변환
                if thumbnail_path and ("storage/images" in thumbnail_path or "backend/storage" in thumbnail_path):
                    if "storage/images/" in thumbnail_path:
                        relative_path = thumbnail_path.split("storage/images/")[1]
                        new_metadata["thumbnail_path"] = f"/images/{relative_path.replace(chr(92), '/')}"
                        needs_update = True

                # 업데이트 실행
                if needs_update:
                    payload["metadata"] = new_metadata
                    client.update_payload(
                        collection_name=collection_name,
                        payload=payload,
                        points=[point.id]
                    )
                    updated_in_collection += 1

            print(f"  진행: {updated_in_collection}개 업데이트됨...", end="\r")

            if next_offset is None:
                break
            offset = next_offset

        if updated_in_collection > 0:
            print(f"  ✅ {collection_name}: {updated_in_collection}개 포인트 업데이트")
            total_updated += updated_in_collection
        else:
            print(f"  ⏭️  {collection_name}: 업데이트 불필요")

    print(f"\n✨ 완료! 총 {total_updated}개 이미지 경로 수정됨")

if __name__ == "__main__":
    asyncio.run(migrate_image_paths())
