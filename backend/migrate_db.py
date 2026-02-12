"""
데이터베이스 마이그레이션 스크립트
- 기존 테이블에 새 컬럼 추가
"""
import asyncio
import asyncpg
from app.core.config import settings


async def add_columns():
    """누락된 컬럼들을 추가"""

    # DATABASE_URL에서 연결 정보 추출
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    print(f"Connecting to database...")
    conn = await asyncpg.connect(db_url)

    try:
        print("\n1. Adding columns to user_settings...")

        # search_mode 컬럼 추가
        await conn.execute("""
            ALTER TABLE user_settings
            ADD COLUMN IF NOT EXISTS search_mode VARCHAR(20) DEFAULT 'hybrid'
        """)
        print("[OK] Added search_mode")

        # use_multimodal_search 컬럼 추가
        await conn.execute("""
            ALTER TABLE user_settings
            ADD COLUMN IF NOT EXISTS use_multimodal_search BOOLEAN DEFAULT FALSE
        """)
        print("[OK] Added use_multimodal_search")

        print("\n2. Adding columns to knowledge_bases...")

        # external_service_id 컬럼 추가
        await conn.execute("""
            ALTER TABLE knowledge_bases
            ADD COLUMN IF NOT EXISTS external_service_id INTEGER
        """)
        print("[OK] Added external_service_id")

        # chunking_method 컬럼 추가
        await conn.execute("""
            ALTER TABLE knowledge_bases
            ADD COLUMN IF NOT EXISTS chunking_method VARCHAR(20) DEFAULT 'fixed'
        """)
        print("[OK] Added chunking_method")

        # semantic_threshold 컬럼 추가
        await conn.execute("""
            ALTER TABLE knowledge_bases
            ADD COLUMN IF NOT EXISTS semantic_threshold FLOAT DEFAULT 0.75
        """)
        print("[OK] Added semantic_threshold")

        print("\n3. Verifying user_settings columns...")
        rows = await conn.fetch("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'user_settings'
            ORDER BY ordinal_position
        """)
        for row in rows:
            print(f"  - {row['column_name']}: {row['data_type']}")

        print("\n4. Verifying knowledge_bases columns...")
        rows = await conn.fetch("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'knowledge_bases'
            ORDER BY ordinal_position
        """)
        for row in rows:
            print(f"  - {row['column_name']}: {row['data_type']}")

        print("\n[SUCCESS] Migration completed successfully!")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(add_columns())
