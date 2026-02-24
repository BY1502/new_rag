"""
QdrantStore — Qdrant 벡터 DB 구현체
기존 VectorStoreService의 검색 로직을 BaseVectorStore 인터페이스로 캡슐화
Sparse Vector (BM25) + Hybrid Search 지원
"""
import asyncio
import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient, models

from app.services.vdb.base import BaseVectorStore

logger = logging.getLogger(__name__)


class QdrantStore(BaseVectorStore):
    """Qdrant 벡터 DB 구현체 (Dense + Sparse 하이브리드 검색 지원)"""

    def __init__(
        self,
        client: QdrantClient,
        collection_name: str,
        embeddings: Any,
        embedding_dimension: int,
        user_id: Optional[int] = None,
    ):
        """
        Args:
            client: QdrantClient 인스턴스 (내부 or 외부)
            collection_name: Qdrant 컬렉션 이름 (e.g. "kb_abc123")
            embeddings: HuggingFaceEmbeddings 인스턴스
            embedding_dimension: 임베딩 차원
            user_id: 사용자 ID (None이면 필터 없이 검색 — 외부 VDB용)
        """
        self.client = client
        self.collection_name = collection_name
        self.embeddings = embeddings
        self.embedding_dimension = embedding_dimension
        self.user_id = user_id

    def _ensure_collection(self):
        """컬렉션이 없으면 생성 (triple vector: dense + sparse + clip)"""
        if not self.client.collection_exists(self.collection_name):
            logger.info(f"Creating multimodal collection: {self.collection_name}")
            try:
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config={
                        "dense": models.VectorParams(
                            size=self.embedding_dimension,  # 1024 for BGE-m3
                            distance=models.Distance.COSINE,
                        ),
                        "clip": models.VectorParams(
                            size=512,  # CLIP ViT-B/32
                            distance=models.Distance.COSINE,
                        )
                    },
                    sparse_vectors_config={
                        "text-sparse": models.SparseVectorParams(
                            index=models.SparseIndexParams(
                                on_disk=False  # 빠른 검색을 위해 메모리 사용
                            )
                        )
                    },
                )
                logger.info(f"Created collection with triple vectors: {self.collection_name}")
            except Exception as e:
                logger.error(f"Failed to create collection {self.collection_name}: {e}")
                raise

    def _has_sparse_vectors(self) -> bool:
        """컬렉션에 text-sparse 벡터가 설정되어 있는지 확인"""
        try:
            info = self.client.get_collection(self.collection_name)
            sparse_config = info.config.params.sparse_vectors or {}
            return "text-sparse" in sparse_config
        except Exception:
            return False

    def _build_vector_store(self) -> QdrantVectorStore:
        """QdrantVectorStore 인스턴스 생성 (dense vector만, 하위 호환)"""
        self._ensure_collection()
        return QdrantVectorStore(
            client=self.client,
            collection_name=self.collection_name,
            embedding=self.embeddings,
            vector_name="dense",
            content_payload_key="page_content",
            metadata_payload_key="metadata",
        )

    def _build_user_filter(self) -> Optional[models.Filter]:
        """user_id 기반 메타데이터 필터 (외부 VDB면 None)"""
        if self.user_id is None:
            return None
        return models.Filter(
            must=[
                models.FieldCondition(
                    key="metadata.user_id",
                    match=models.MatchValue(value=self.user_id),
                )
            ]
        )

    async def _load_vocabulary(self) -> Dict[str, int]:
        """Redis에서 어휘 로드"""
        try:
            from app.services.cache_service import get_cache_service
            cache = get_cache_service()
            key = f"bm25:vocab:{self.collection_name}"
            vocab_json = await cache.get(key)
            if vocab_json:
                return json.loads(vocab_json)
            else:
                logger.debug(f"No vocabulary found for {self.collection_name}")
                return {}
        except Exception as e:
            logger.warning(f"Failed to load vocabulary: {e}")
            return {}

    async def _save_vocabulary(self, vocab: Dict[str, int]):
        """Redis에 어휘 저장 (TTL 없음)"""
        try:
            from app.services.cache_service import get_cache_service
            cache = get_cache_service()
            key = f"bm25:vocab:{self.collection_name}"
            await cache.set(key, json.dumps(vocab), ttl=0)  # 영구 저장
            logger.debug(f"Saved vocabulary ({len(vocab)} terms) for {self.collection_name}")
        except Exception as e:
            logger.error(f"Failed to save vocabulary: {e}")

    async def search(
        self,
        query: str,
        top_k: int = 4,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """Dense 벡터 유사도 검색 (기존 방식, 하위 호환)"""
        vs = self._build_vector_store()
        user_filter = self._build_user_filter()

        search_kwargs: Dict[str, Any] = {"k": top_k}
        if user_filter:
            search_kwargs["filter"] = user_filter

        retriever = vs.as_retriever(
            search_type="similarity",
            search_kwargs=search_kwargs,
        )
        return await retriever.ainvoke(query)

    async def hybrid_search(
        self,
        query: str,
        top_k: int = 4,
        alpha: float = 0.5,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """
        Dense + Sparse 가중 하이브리드 검색 (Weighted RRF fusion)

        Args:
            query: 검색 쿼리
            top_k: 반환할 문서 수
            alpha: Dense 가중치 (0.0=Sparse only, 1.0=Dense only, 0.5=균등)
            filters: 추가 필터 (미사용)

        Returns:
            검색된 Document 리스트
        """
        from app.services.bm25_processor import get_bm25_processor

        try:
            # 극단값: Dense only
            if alpha >= 1.0:
                return await self.search(query, top_k)

            # 극단값: Sparse only
            if alpha <= 0.0:
                return await self.sparse_search(query, top_k)

            # 0. 컬렉션에 sparse vector가 없으면 dense-only로 폴백
            if not self._has_sparse_vectors():
                logger.info(f"Collection {self.collection_name} has no sparse vectors, using dense search")
                return await self.search(query, top_k)

            # 1. Dense embedding
            query_embedding = self.embeddings.embed_query(query)

            # 2. Sparse vector (BM25)
            bm25 = get_bm25_processor()
            vocab = await self._load_vocabulary()

            if not vocab:
                logger.warning(f"No vocabulary for {self.collection_name}, falling back to dense search")
                return await self.search(query, top_k)

            sparse_vector = bm25.compute_sparse_vector(query, vocab)

            if not sparse_vector:
                logger.warning("Failed to compute sparse vector, falling back to dense search")
                return await self.search(query, top_k)

            # 3. 개별 검색 (Dense + Sparse)
            user_filter = self._build_user_filter()
            oversample = top_k * 3

            dense_results = self.client.query_points(
                collection_name=self.collection_name,
                query=query_embedding,
                using="dense",
                query_filter=user_filter,
                limit=oversample,
                with_payload=True,
                with_vectors=False,
            )

            sparse_results = self.client.query_points(
                collection_name=self.collection_name,
                query=models.SparseVector(
                    indices=list(sparse_vector.keys()),
                    values=list(sparse_vector.values()),
                ),
                using="text-sparse",
                query_filter=user_filter,
                limit=oversample,
                with_payload=True,
                with_vectors=False,
            )

            # 4. Weighted RRF (Reciprocal Rank Fusion)
            RRF_K = 60  # 표준 RRF 상수
            score_map: Dict[str, Dict[str, Any]] = {}

            for rank, point in enumerate(dense_results.points):
                pid = str(point.id)
                rrf_score = alpha * (1.0 / (RRF_K + rank))
                score_map[pid] = {"score": rrf_score, "payload": point.payload}

            for rank, point in enumerate(sparse_results.points):
                pid = str(point.id)
                rrf_score = (1.0 - alpha) * (1.0 / (RRF_K + rank))
                if pid in score_map:
                    score_map[pid]["score"] += rrf_score
                else:
                    score_map[pid] = {"score": rrf_score, "payload": point.payload}

            # 5. 점수 내림차순 정렬 → top_k
            sorted_items = sorted(score_map.values(), key=lambda x: x["score"], reverse=True)[:top_k]

            docs = []
            for item in sorted_items:
                docs.append(Document(
                    page_content=item["payload"].get("page_content", ""),
                    metadata=item["payload"].get("metadata", {}),
                ))

            logger.debug(f"Hybrid search (alpha={alpha}) returned {len(docs)} documents")
            return docs

        except Exception as e:
            logger.error(f"Hybrid search failed: {e}, falling back to dense search")
            return await self.search(query, top_k)

    async def sparse_search(
        self,
        query: str,
        top_k: int = 4,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Document]:
        """
        BM25 Sparse 검색만

        Args:
            query: 검색 쿼리
            top_k: 반환할 문서 수
            filters: 추가 필터 (미사용)

        Returns:
            검색된 Document 리스트
        """
        from app.services.bm25_processor import get_bm25_processor

        try:
            # 컬렉션에 sparse vector가 없으면 빈 결과 반환
            if not self._has_sparse_vectors():
                logger.warning(f"Collection {self.collection_name} has no sparse vectors")
                return []

            # 1. Sparse vector (BM25)
            bm25 = get_bm25_processor()
            vocab = await self._load_vocabulary()

            if not vocab:
                logger.warning(f"No vocabulary for {self.collection_name}, cannot perform sparse search")
                return []

            sparse_vector = bm25.compute_sparse_vector(query, vocab)

            if not sparse_vector:
                logger.warning("Failed to compute sparse vector")
                return []

            # 2. Qdrant sparse query
            user_filter = self._build_user_filter()

            results = self.client.query_points(
                collection_name=self.collection_name,
                query=models.SparseVector(
                    indices=list(sparse_vector.keys()),
                    values=list(sparse_vector.values())
                ),
                using="text-sparse",
                query_filter=user_filter,
                limit=top_k,
                with_payload=True,
                with_vectors=False,
            )

            # 3. Document 객체로 변환
            docs = []
            for point in results.points:
                docs.append(Document(
                    page_content=point.payload.get("page_content", ""),
                    metadata=point.payload.get("metadata", {})
                ))

            logger.debug(f"Sparse search returned {len(docs)} documents")
            return docs

        except Exception as e:
            logger.error(f"Sparse search failed: {e}")
            return []

    async def multimodal_search(
        self,
        query_vector: List[float],
        content_type_filter: Optional[str] = None,
        top_k: int = 4,
    ) -> List[Document]:
        """
        CLIP 벡터 기반 멀티모달 검색 (텍스트 ↔ 이미지 크로스 검색)

        Args:
            query_vector: CLIP 임베딩 벡터 (512-dim)
            content_type_filter: "text" | "image" | None (둘 다 검색)
            top_k: 반환할 문서 수

        Returns:
            검색된 Document 리스트
        """
        try:
            self._ensure_collection()

            # 사용자 필터
            user_filter = self._build_user_filter()

            # content_type 필터 추가
            filter_conditions = []
            if user_filter:
                filter_conditions.extend(user_filter.must)

            if content_type_filter:
                filter_conditions.append(
                    models.FieldCondition(
                        key="metadata.content_type",
                        match=models.MatchValue(value=content_type_filter)
                    )
                )

            final_filter = models.Filter(must=filter_conditions) if filter_conditions else None

            # CLIP 벡터 검색
            results = self.client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                using="clip",
                query_filter=final_filter,
                limit=top_k,
                with_payload=True,
                with_vectors=False,
                score_threshold=0.0,
            )

            # Document 객체로 변환
            docs = []
            for point in results.points:
                docs.append(Document(
                    page_content=point.payload.get("page_content", ""),
                    metadata=point.payload.get("metadata", {})
                ))

            logger.debug(f"Multimodal search returned {len(docs)} documents (content_type={content_type_filter})")
            return docs

        except Exception as e:
            logger.error(f"Multimodal search failed: {e}")
            return []

    async def add_documents(
        self,
        texts: List[str],
        metadatas: Optional[List[dict]] = None,
    ) -> None:
        """
        문서 추가 (Dense + Sparse vectors)

        Args:
            texts: 문서 텍스트 리스트
            metadatas: 메타데이터 리스트
        """
        from app.services.bm25_processor import get_bm25_processor

        try:
            self._ensure_collection()

            # 1. Sparse vectors (BM25)
            bm25 = get_bm25_processor()

            # 어휘 업데이트 (기존 + 새 문서)
            vocab = await self._load_vocabulary()
            new_vocab = bm25.build_vocabulary(texts)

            # 기존 어휘와 병합 (새 term에 새 index 할당)
            for term in new_vocab:
                if term not in vocab:
                    vocab[term] = len(vocab)

            await self._save_vocabulary(vocab)

            # Sparse vectors 계산
            sparse_vectors = [
                bm25.compute_sparse_vector(text, vocab)
                for text in texts
            ]

            # 2. Dense embeddings
            dense_embeddings = self.embeddings.embed_documents(texts)

            # 3. Qdrant에 dual vectors 저장
            points = []
            for i, (text, meta, dense_emb, sparse_vec) in enumerate(
                zip(texts, metadatas or [{}] * len(texts), dense_embeddings, sparse_vectors)
            ):
                point_id = str(uuid.uuid4())

                # Sparse vector 변환
                sparse_indices = list(sparse_vec.keys())
                sparse_values = list(sparse_vec.values())

                points.append(
                    models.PointStruct(
                        id=point_id,
                        vector={
                            "dense": dense_emb,
                            "text-sparse": models.SparseVector(
                                indices=sparse_indices,
                                values=sparse_values
                            )
                        },
                        payload={
                            "page_content": text,
                            "metadata": meta
                        }
                    )
                )

            # 배치 업로드
            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )

            logger.info(f"Added {len(texts)} documents (dual vectors) to {self.collection_name}")

        except Exception as e:
            logger.error(f"Failed to add documents: {e}")
            # Graceful fallback to dense-only
            logger.info("Falling back to dense-only indexing")
            vs = self._build_vector_store()
            await vs.aadd_texts(texts=texts, metadatas=metadatas or [])

    async def add_clip_text_vectors(
        self,
        texts: List[str],
        clip_vectors: List[List[float]],
        metadatas: List[dict],
    ) -> None:
        """
        기존 텍스트 포인트에 CLIP 벡터 추가 (메타데이터 매칭)

        Args:
            texts: 텍스트 리스트
            clip_vectors: CLIP 텍스트 임베딩 벡터 리스트
            metadatas: 메타데이터 리스트 (매칭용)
        """
        try:
            self._ensure_collection()

            # 컬렉션의 모든 포인트 조회
            user_filter = self._build_user_filter()
            scroll_result = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=user_filter,
                limit=10000,
                with_payload=True,
                with_vectors=False,
            )

            points = scroll_result[0]

            # 메타데이터 매칭하여 포인트 업데이트
            update_count = 0
            for text, clip_vec, metadata in zip(texts, clip_vectors, metadatas):
                # source와 chunk_index로 포인트 찾기
                source = metadata.get("source")
                chunk_index = metadata.get("chunk_index")

                matching_point = None
                for point in points:
                    payload_meta = point.payload.get("metadata", {})
                    if (payload_meta.get("source") == source and
                        payload_meta.get("chunk_index") == chunk_index):
                        matching_point = point
                        break

                if matching_point:
                    # CLIP 벡터 업데이트
                    self.client.update_vectors(
                        collection_name=self.collection_name,
                        points=[
                            models.PointVectors(
                                id=matching_point.id,
                                vector={"clip": clip_vec}
                            )
                        ]
                    )
                    update_count += 1

            logger.info(f"Updated {update_count}/{len(texts)} points with CLIP text vectors")

        except Exception as e:
            logger.error(f"Failed to add CLIP text vectors: {e}")
            raise

    async def add_image_documents(
        self,
        image_docs: List[dict],
    ) -> None:
        """
        이미지 문서를 CLIP + BGE 벡터와 함께 Qdrant에 추가

        이미지의 page_content (캡션 + OCR 텍스트)를 BGE로 임베딩하여
        텍스트 검색으로도 이미지를 찾을 수 있게 합니다.

        Args:
            image_docs: 이미지 문서 리스트
                [{"content": str, "metadata": dict, "clip_vector": List[float]}]
        """
        try:
            self._ensure_collection()

            # page_content를 BGE로 임베딩 (텍스트 검색 가능하게)
            contents = [doc["content"] for doc in image_docs]
            dense_vectors = await asyncio.to_thread(
                self.embeddings.embed_documents,
                contents
            )

            points = []
            for doc, dense_vec in zip(image_docs, dense_vectors):
                point_id = str(uuid.uuid4())

                # Triple vectors: dense (BGE 1024-dim) + CLIP (512-dim)
                # BM25 sparse는 텍스트 검색에만 사용하므로 이미지는 제외
                points.append(
                    models.PointStruct(
                        id=point_id,
                        vector={
                            "dense": dense_vec,  # BGE: page_content (캡션 + OCR 텍스트)
                            "clip": doc["clip_vector"],  # CLIP: 이미지 임베딩
                        },
                        payload={
                            "page_content": doc["content"],
                            "metadata": doc["metadata"]
                        }
                    )
                )

            # 배치 업로드
            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )

            logger.info(f"Added {len(points)} image documents with dense + CLIP vectors")

        except Exception as e:
            logger.error(f"Failed to add image documents: {e}")
            raise

    def collection_exists(self, collection_name: str) -> bool:
        """컬렉션 존재 여부"""
        return self.client.collection_exists(collection_name)
