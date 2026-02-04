from langchain_community.graphs import Neo4jGraph
from app.core.config import settings
import os

class GraphStoreService:
    def __init__(self):
        # Neo4j 연결 초기화
        # settings.NEO4J_URI 등이 .env에 정의되어 있어야 합니다.
        try:
            self.graph = Neo4jGraph(
                url=settings.NEO4J_URL,
                username=settings.NEO4J_USERNAME,
                password=settings.NEO4J_PASSWORD
            )
            print("✅ Connected to Neo4j Graph Database")
        except Exception as e:
            print(f"⚠️ Failed to connect to Neo4j: {e}")
            self.graph = None

    def add_graph_documents(self, graph_documents):
        """
        LLM이 추출한 그래프 문서(Node, Edge)를 Neo4j에 저장
        """
        if not self.graph:
            print("❌ Graph Store not initialized.")
            return False
            
        try:
            self.graph.add_graph_documents(
                graph_documents, 
                baseEntityLabel=True, # 모든 노드에 __Entity__ 라벨 추가 (검색 용이성)
                include_source=True   # 출처 문서 정보 포함
            )
            return True
        except Exception as e:
            print(f"❌ Neo4j Save Error: {e}")
            return False

    def query(self, query: str):
        """
        Cypher 쿼리 직접 실행
        """
        if not self.graph:
            return []
        return self.graph.query(query)