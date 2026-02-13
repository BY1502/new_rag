import logging
import datetime
from functools import lru_cache
from langchain_community.graphs import Neo4jGraph
from app.core.config import settings

logger = logging.getLogger(__name__)

class GraphStoreService:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if GraphStoreService._initialized:
            return

        self.graph = None
        self._connect()

        GraphStoreService._initialized = True

    def _connect(self):
        """Neo4j 연결을 시도합니다."""
        try:
            self.graph = Neo4jGraph(
                url=settings.NEO4J_URL,
                username=settings.NEO4J_USERNAME,
                password=settings.NEO4J_PASSWORD
            )
            logger.info("Connected to Neo4j Graph Database (singleton)")
        except Exception as e:
            logger.warning(f"Failed to connect to Neo4j: {e}")
            self.graph = None

    def ensure_connection(self):
        """연결이 없으면 재연결을 시도합니다."""
        if self.graph is None:
            logger.info("Neo4j not connected, attempting reconnection...")
            self._connect()
        return self.graph is not None

    def add_graph_documents(self, graph_documents):
        self.ensure_connection()
        if not self.graph:
            logger.warning("Neo4j not connected, skipping graph documents")
            return False
        try:
            self.graph.add_graph_documents(
                graph_documents,
                baseEntityLabel=True,
                include_source=True
            )
            return True
        except Exception as e:
            logger.error(f"Neo4j Save Error: {e}")
            return False

    def add_graph_documents_with_metadata(self, graph_documents, kb_id: str, user_id: int):
        """그래프 문서를 추가하고 kb_id/user_id로 태깅합니다."""
        if not self.add_graph_documents(graph_documents):
            return False
        try:
            self.graph.query(
                "MATCH (n:__Entity__) WHERE n.kb_id IS NULL "
                "SET n.kb_id = $kb_id, n.user_id = $user_id",
                {"kb_id": kb_id, "user_id": user_id}
            )
            return True
        except Exception as e:
            logger.warning(f"Failed to tag graph nodes: {e}")
            return True  # 문서는 추가됨

    def get_graph_context(self, query_text: str, kb_id: str, user_id: int, limit: int = 10) -> str:
        """질문에서 키워드를 추출하여 관련 그래프 컨텍스트를 반환합니다."""
        self.ensure_connection()
        if not self.graph:
            return ""

        # 간단한 키워드 추출 (공백 분리, 2자 이상)
        keywords = [w.strip() for w in query_text.split() if len(w.strip()) >= 2]
        if not keywords:
            return ""

        # 상위 5개 키워드만 사용
        keywords = keywords[:5]

        try:
            all_triples = []
            for keyword in keywords:
                result = self.graph.query(
                    """
                    MATCH (n:__Entity__)
                    WHERE n.kb_id = $kb_id AND n.user_id = $user_id
                      AND toLower(n.name) CONTAINS toLower($keyword)
                    OPTIONAL MATCH (n)-[r]-(m)
                    WHERE m.kb_id = $kb_id
                    RETURN n.name AS entity, type(r) AS rel, m.name AS related
                    LIMIT $limit
                    """,
                    {"kb_id": kb_id, "user_id": user_id, "keyword": keyword, "limit": limit}
                )
                for row in result:
                    entity = row.get("entity", "")
                    rel = row.get("rel")
                    related = row.get("related")
                    if rel and related:
                        all_triples.append(f"{entity} --{rel}--> {related}")
                    elif entity:
                        all_triples.append(f"Entity: {entity}")

            if not all_triples:
                return ""

            # 중복 제거
            unique_triples = list(dict.fromkeys(all_triples))[:20]
            return "\n".join(unique_triples)
        except Exception as e:
            logger.warning(f"Graph context retrieval failed: {e}")
            return ""

    def query(self, query: str, params: dict = None):
        self.ensure_connection()
        if not self.graph:
            logger.warning("Neo4j not connected")
            return []
        try:
            return self.graph.query(query, params or {})
        except Exception as e:
            logger.error(f"Neo4j Query Error: {e}")
            return []

    def log_process_execution(self, session_id: str, step_name: str, status: str, details: str):
        """xLAM 프로세스 실행 로그 저장"""
        self.ensure_connection()
        if not self.graph:
            return

        timestamp = datetime.datetime.now().isoformat()

        # 실행 노드 생성
        query = """
        MERGE (s:Session {id: $session_id})
        CREATE (p:ProcessExecution {
            name: $step_name,
            status: $status,
            timestamp: $timestamp,
            details: $details
        })
        MERGE (s)-[:EXECUTED]->(p)
        """
        params = {
            "session_id": session_id,
            "step_name": step_name,
            "status": status,
            "timestamp": timestamp,
            "details": str(details)[:500]  # 길이 제한
        }

        try:
            self.graph.query(query, params)
        except Exception as e:
            logger.warning(f"Failed to log process execution: {e}")


@lru_cache()
def get_graph_store_service() -> GraphStoreService:
    """싱글톤 GraphStoreService 인스턴스 반환"""
    return GraphStoreService()
