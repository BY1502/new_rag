from langchain_community.graphs import Neo4jGraph
from app.core.config import settings
import os
import datetime

class GraphStoreService:
    def __init__(self):
        try:
            self.graph = Neo4jGraph(
                url=settings.NEO4J_URI,
                username=settings.NEO4J_USERNAME,
                password=settings.NEO4J_PASSWORD
            )
            print("✅ Connected to Neo4j Graph Database")
        except Exception as e:
            print(f"⚠️ Failed to connect to Neo4j: {e}")
            self.graph = None

    def add_graph_documents(self, graph_documents):
        if not self.graph: return False
        try:
            self.graph.add_graph_documents(
                graph_documents, 
                baseEntityLabel=True, 
                include_source=True
            )
            return True
        except Exception as e:
            print(f"❌ Neo4j Save Error: {e}")
            return False

    def query(self, query: str):
        if not self.graph: return []
        return self.graph.query(query)

    # ✅ [NEW] xLAM 프로세스 실행 로그 저장
    def log_process_execution(self, session_id, step_name, status, details, prev_step=None):
        if not self.graph: return
        
        timestamp = datetime.datetime.now().isoformat()
        
        # 1. 실행 노드 생성
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
            "details": str(details)[:500] # 길이 제한
        }
        
        self.graph.query(query, params)
        
        # 2. 이전 단계와 관계 연결 (Flow 추적)
        if prev_step:
            link_query = """
            MATCH (p1:ProcessExecution {name: $prev_step, timestamp: $timestamp})
            MATCH (p2:ProcessExecution {name: $curr_step, timestamp: $timestamp})
            MERGE (p1)-[:NEXT_STEP]->(p2)
            """
            # (Timestamp 매칭은 예시이며 실제론 ID로 관리 권장)
            pass