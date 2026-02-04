import os
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient, models
from langchain_huggingface import HuggingFaceEmbeddings
from app.core.config import settings

class VectorStoreService:
    def __init__(self):
        # 임베딩 모델 설정
        device = "cpu"
        import torch
        if torch.cuda.is_available(): device = "cuda"
        elif torch.backends.mps.is_available(): device = "mps"

        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': device, 'trust_remote_code': True},
            encode_kwargs={'normalize_embeddings': True}
        )
        
        self.client = QdrantClient(url=settings.QDRANT_URL)

    def get_retriever(self, kb_id: str, user_id: int):
        """
        [핵심 수정] 검색 시 content_payload_key를 명시하여 벡터 데이터가 아닌 텍스트만 가져오게 함
        """
        collection_name = f"kb_{kb_id}"
        
        # 컬렉션 존재 여부 확인 (없으면 생성하지 않음 - 검색 시점이니까)
        # LangChain의 QdrantVectorStore는 컬렉션이 없으면 에러날 수 있으므로 예외처리 가능하지만
        # 여기서는 존재하는 것을 가정하고 설정합니다.

        vector_store = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embeddings,
            # ✅ 여기가 중요! "page_content" 필드만 텍스트로 인식하도록 강제
            content_payload_key="page_content",
            metadata_payload_key="metadata"
        )
        
        # 유저 ID 필터링 (내 문서만 검색)
        user_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="metadata.user_id",
                    match=models.MatchValue(value=user_id)
                )
            ]
        )

        return vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={
                "k": 4, 
                "filter": user_filter
            }
        )

    async def add_documents(self, kb_id: str, texts: list, metadatas: list):
        """
        문서 저장
        """
        collection_name = f"kb_{kb_id}"
        
        vector_store = QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.embeddings,
            content_payload_key="page_content",
            metadata_payload_key="metadata"
        )
        
        await vector_store.aadd_texts(texts=texts, metadatas=metadatas)