"""
Text-to-SQL 서비스
- 자연어 → SQL 변환
- READ-ONLY 쿼리만 허용 (SELECT)
- 결과를 tabulate로 포맷팅
- RAG 스트리밍 형식과 동일한 JSON 라인 출력
"""
import json
import logging
import re
from functools import lru_cache
from typing import AsyncGenerator, Optional

from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.utilities import SQLDatabase
from tabulate import tabulate

from app.core.config import settings

logger = logging.getLogger(__name__)


class T2SQLService:
    """Text-to-SQL 서비스 (싱글톤)"""

    _instance: Optional["T2SQLService"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if T2SQLService._initialized:
            return
        T2SQLService._initialized = True
        logger.info("T2SQLService initialized (singleton)")

    def _validate_sql(self, sql: str) -> bool:
        """SELECT 쿼리만 허용. 데이터 변경 쿼리 차단."""
        normalized = sql.strip().upper()
        forbidden = [
            "DROP", "DELETE", "UPDATE", "INSERT", "ALTER",
            "TRUNCATE", "CREATE", "GRANT", "REVOKE", "EXEC",
        ]
        first_word = normalized.split()[0] if normalized.split() else ""
        if first_word not in ("SELECT", "WITH", "EXPLAIN", "SHOW", "DESCRIBE"):
            return False
        for kw in forbidden:
            if re.search(rf'\b{kw}\b', normalized):
                return False
        return True

    async def generate_and_execute(
        self,
        message: str,
        connection_uri: str,
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        NL → SQL → Execute → Stream results

        Yields JSON lines:
          {"type": "thinking", "thinking": "..."}
          {"type": "sql", "sql": "..."}
          {"type": "content", "content": "..."}
        """
        target_model = model or settings.LLM_MODEL
        llm = ChatOllama(model=target_model, temperature=0)

        # Step 1: DB 연결 & 스키마 추출
        yield json.dumps({
            "type": "thinking",
            "thinking": "데이터베이스 스키마를 분석하고 있습니다..."
        }) + "\n"

        try:
            db = SQLDatabase.from_uri(connection_uri)
            schema_info = db.get_table_info()
        except Exception as e:
            yield json.dumps({
                "type": "content",
                "content": f"데이터베이스 연결 실패: {e}"
            }) + "\n"
            return

        # Step 2: NL → SQL 변환
        yield json.dumps({
            "type": "thinking",
            "thinking": "자연어를 SQL로 변환 중..."
        }) + "\n"

        sql_prompt = ChatPromptTemplate.from_template(
            "You are a SQL expert. Given the database schema below, write a SQL SELECT query "
            "that answers the user's question. Return ONLY the SQL query, no explanation.\n\n"
            "[Database Schema]\n{schema}\n\n"
            "[User Question]\n{question}\n\n"
            "SQL Query:"
        )

        chain = sql_prompt | llm | StrOutputParser()

        try:
            raw_sql = await chain.ainvoke({
                "schema": schema_info,
                "question": message
            })
            sql = re.sub(r'```sql?\s*', '', raw_sql).strip().rstrip('`').strip()
        except Exception as e:
            yield json.dumps({
                "type": "content",
                "content": f"SQL 생성 실패: {e}"
            }) + "\n"
            return

        # Step 3: SQL 검증 (SELECT만)
        if not self._validate_sql(sql):
            yield json.dumps({
                "type": "content",
                "content": f"안전하지 않은 쿼리가 감지되었습니다. SELECT 쿼리만 허용됩니다.\n\n생성된 SQL:\n```sql\n{sql}\n```"
            }) + "\n"
            return

        # 생성된 SQL 전송
        yield json.dumps({"type": "sql", "sql": sql}) + "\n"
        yield json.dumps({
            "type": "thinking",
            "thinking": "SQL 실행 중..."
        }) + "\n"

        # Step 4: 실행 & 결과 포맷팅
        try:
            from sqlalchemy import create_engine, text
            engine = create_engine(connection_uri)
            with engine.connect() as conn:
                rs = conn.execute(text(sql))
                columns = list(rs.keys())
                rows = [list(row) for row in rs.fetchmany(100)]
                total = len(rows)
            engine.dispose()

            if rows:
                table_str = tabulate(rows, headers=columns, tablefmt="pipe")
                yield json.dumps({
                    "type": "content",
                    "content": (
                        f"**실행된 SQL:**\n```sql\n{sql}\n```\n\n"
                        f"**결과 ({total}건):**\n\n{table_str}"
                    )
                }) + "\n"
            else:
                yield json.dumps({
                    "type": "content",
                    "content": f"**실행된 SQL:**\n```sql\n{sql}\n```\n\n결과가 없습니다."
                }) + "\n"

        except Exception as e:
            yield json.dumps({
                "type": "content",
                "content": f"SQL 실행 오류: {e}\n\n**생성된 SQL:**\n```sql\n{sql}\n```"
            }) + "\n"


@lru_cache()
def get_t2sql_service() -> T2SQLService:
    """싱글톤 T2SQLService 인스턴스 반환"""
    return T2SQLService()
