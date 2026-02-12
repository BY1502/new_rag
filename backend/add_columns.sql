-- 멀티모달 시스템을 위한 컬럼 추가 SQL
-- PostgreSQL에서 실행하세요

-- 1. user_settings 테이블에 search_mode, use_multimodal_search 추가
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS search_mode VARCHAR(20) DEFAULT 'hybrid';

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS use_multimodal_search BOOLEAN DEFAULT FALSE;

-- 2. knowledge_bases 테이블에 누락된 컬럼들 추가 (이전 기능)
ALTER TABLE knowledge_bases
ADD COLUMN IF NOT EXISTS external_service_id INTEGER;

ALTER TABLE knowledge_bases
ADD COLUMN IF NOT EXISTS chunking_method VARCHAR(20) DEFAULT 'fixed';

ALTER TABLE knowledge_bases
ADD COLUMN IF NOT EXISTS semantic_threshold FLOAT DEFAULT 0.75;

-- 확인
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_settings'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'knowledge_bases'
ORDER BY ordinal_position;
