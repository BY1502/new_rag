"""
도구 레지스트리 - MCP 서버 및 내장 도구 관리
"""
import ast
import json
import operator
import logging
import asyncio
from typing import List, Dict, Any, Optional
from contextlib import AsyncExitStack

from langchain_community.tools import DuckDuckGoSearchResults
from langchain_core.tools import tool, BaseTool

logger = logging.getLogger(__name__)


# ============================================================
# 내장 도구 정의
# ============================================================

@tool
def calculator(expression: str) -> str:
    """
    수학 표현식을 안전하게 계산합니다.
    예: "2 + 3 * 4", "(10 - 5) ** 2"
    """
    allowed_operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    def _eval(node):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in allowed_operators:
                raise ValueError(f"허용되지 않은 연산자: {op_type}")
            return allowed_operators[op_type](_eval(node.left), _eval(node.right))
        elif isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in allowed_operators:
                raise ValueError(f"허용되지 않은 연산자: {op_type}")
            return allowed_operators[op_type](_eval(node.operand))
        else:
            raise ValueError(f"허용되지 않은 노드 타입: {type(node)}")

    try:
        tree = ast.parse(expression, mode='eval')
        result = _eval(tree.body)
        return str(result)
    except Exception as e:
        return f"계산 오류: {str(e)}"


def get_web_search_tool(num_results: int = 5) -> BaseTool:
    """웹 검색 도구 생성"""
    return DuckDuckGoSearchResults(backend="api", num_results=num_results)


# ============================================================
# 내장 도구 ID 매핑
# ============================================================

BUILTIN_TOOLS: Dict[str, Dict[str, Any]] = {
    "web-search": {
        "name": "웹 검색",
        "description": "DuckDuckGo를 사용한 웹 검색",
        "factory": lambda: get_web_search_tool(),
    },
    "calculator": {
        "name": "계산기",
        "description": "수학 표현식 계산",
        "factory": lambda: calculator,
    },
}


# ============================================================
# MCP 도구 래퍼 (LangChain BaseTool 호환)
# ============================================================

class MCPToolWrapper(BaseTool):
    """MCP 서버의 도구를 LangChain BaseTool로 래핑"""
    name: str = ""
    description: str = ""
    mcp_session: Any = None
    mcp_tool_name: str = ""

    class Config:
        arbitrary_types_allowed = True

    def _run(self, query: str, **kwargs) -> str:
        """동기 실행 (폴백)"""
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    result = pool.submit(
                        asyncio.run, self._arun(query, **kwargs)
                    ).result(timeout=30)
                return result
            return loop.run_until_complete(self._arun(query, **kwargs))
        except Exception as e:
            return f"도구 실행 오류: {e}"

    async def _arun(self, query: str, **kwargs) -> str:
        """비동기 실행 — MCP call_tool"""
        if not self.mcp_session:
            return "MCP 세션이 연결되지 않았습니다."
        try:
            result = await self.mcp_session.call_tool(
                self.mcp_tool_name,
                arguments={"query": query, **kwargs}
            )
            # result.content는 리스트 → 텍스트로 변환
            if hasattr(result, "content") and result.content:
                parts = []
                for item in result.content:
                    if hasattr(item, "text"):
                        parts.append(item.text)
                    else:
                        parts.append(str(item))
                return "\n".join(parts)
            return str(result)
        except Exception as e:
            logger.warning(f"MCP tool call failed ({self.mcp_tool_name}): {e}")
            return f"도구 실행 실패: {e}"


# ============================================================
# MCP 연결 관리자
# ============================================================

class MCPConnection:
    """단일 MCP 서버 연결 관리"""

    def __init__(self, server_id: str, server_type: str, url: str = "",
                 command: str = "", headers: Optional[dict] = None):
        self.server_id = server_id
        self.server_type = server_type
        self.url = url
        self.command = command
        self.headers = headers or {}
        self.session = None
        self._exit_stack: Optional[AsyncExitStack] = None
        self._tools_cache: Optional[List[BaseTool]] = None

    async def connect(self) -> bool:
        """MCP 서버에 연결"""
        try:
            from mcp import ClientSession
            from mcp.client.sse import sse_client
            from mcp.client.stdio import stdio_client, StdioServerParameters

            self._exit_stack = AsyncExitStack()

            if self.server_type in ("sse", "streamableHttp"):
                # SSE 트랜스포트
                read_stream, write_stream = await self._exit_stack.enter_async_context(
                    sse_client(self.url, headers=self.headers)
                )
            elif self.server_type == "stdio":
                # stdio 트랜스포트
                parts = self.command.split()
                if not parts:
                    raise ValueError("stdio 커맨드가 비어있습니다")
                server_params = StdioServerParameters(
                    command=parts[0],
                    args=parts[1:] if len(parts) > 1 else [],
                )
                read_stream, write_stream = await self._exit_stack.enter_async_context(
                    stdio_client(server_params)
                )
            else:
                raise ValueError(f"지원하지 않는 서버 타입: {self.server_type}")

            self.session = await self._exit_stack.enter_async_context(
                ClientSession(read_stream, write_stream)
            )
            await self.session.initialize()

            logger.info(f"MCP 서버 연결 성공: {self.server_id} ({self.server_type})")
            return True

        except Exception as e:
            logger.error(f"MCP 서버 연결 실패 ({self.server_id}): {e}")
            await self.disconnect()
            return False

    async def disconnect(self):
        """연결 해제"""
        try:
            if self._exit_stack:
                await self._exit_stack.aclose()
        except Exception as e:
            logger.debug(f"MCP disconnect cleanup: {e}")
        finally:
            self.session = None
            self._exit_stack = None
            self._tools_cache = None

    async def list_tools(self) -> List[BaseTool]:
        """MCP 서버의 도구 목록을 LangChain BaseTool 래퍼로 반환"""
        if self._tools_cache is not None:
            return self._tools_cache

        if not self.session:
            return []

        try:
            result = await self.session.list_tools()
            tools = []
            for t in result.tools:
                wrapper = MCPToolWrapper(
                    name=f"{self.server_id}_{t.name}",
                    description=t.description or t.name,
                    mcp_session=self.session,
                    mcp_tool_name=t.name,
                )
                tools.append(wrapper)
            self._tools_cache = tools
            logger.info(f"MCP 서버 '{self.server_id}'에서 {len(tools)}개 도구 로드")
            return tools
        except Exception as e:
            logger.error(f"MCP 도구 목록 조회 실패 ({self.server_id}): {e}")
            return []


# ============================================================
# 도구 레지스트리
# ============================================================

class ToolRegistry:
    """
    MCP 서버 및 내장 도구를 관리하는 레지스트리
    """

    _mcp_connections: Dict[str, MCPConnection] = {}

    @classmethod
    def get_available_tools(cls) -> List[Dict[str, str]]:
        """사용 가능한 모든 도구 목록 반환 (프론트엔드 표시용)"""
        tools = []
        for tool_id, tool_info in BUILTIN_TOOLS.items():
            tools.append({
                "id": tool_id,
                "name": tool_info["name"],
                "description": tool_info["description"],
                "type": "builtin"
            })
        return tools

    @classmethod
    def get_tools(cls, active_mcp_ids: Optional[List[str]] = None) -> List[BaseTool]:
        """동기 도구 조회 (내장 도구만, 하위 호환)"""
        if not active_mcp_ids:
            return []

        tools = []
        for tool_id in active_mcp_ids:
            if tool_id in BUILTIN_TOOLS:
                try:
                    tool_instance = BUILTIN_TOOLS[tool_id]["factory"]()
                    tools.append(tool_instance)
                except Exception as e:
                    logger.error(f"도구 생성 실패 ({tool_id}): {e}")
        return tools

    @classmethod
    async def get_tools_async(
        cls,
        active_mcp_ids: List[str],
        mcp_configs: List[dict],
    ) -> List[BaseTool]:
        """
        비동기 도구 조회 (내장 + MCP 도구)

        Args:
            active_mcp_ids: 활성화할 도구/MCP 서버 ID 목록
            mcp_configs: DB에서 조회한 MCP 서버 설정 리스트
                [{server_id, server_type, url, command, headers_json}, ...]
        """
        if not active_mcp_ids:
            return []

        tools = []

        # 1. 내장 도구
        for tool_id in active_mcp_ids:
            if tool_id in BUILTIN_TOOLS:
                try:
                    tool_instance = BUILTIN_TOOLS[tool_id]["factory"]()
                    tools.append(tool_instance)
                    logger.debug(f"내장 도구 활성화: {tool_id}")
                except Exception as e:
                    logger.error(f"도구 생성 실패 ({tool_id}): {e}")

        # 2. MCP 서버 도구
        for cfg in mcp_configs:
            server_id = cfg.get("server_id", "")
            if server_id not in active_mcp_ids:
                continue

            # 이미 연결된 경우 재사용
            if server_id not in cls._mcp_connections:
                headers = {}
                if cfg.get("headers_json"):
                    try:
                        headers = json.loads(cfg["headers_json"])
                    except (json.JSONDecodeError, TypeError):
                        pass

                conn = MCPConnection(
                    server_id=server_id,
                    server_type=cfg.get("server_type", "sse"),
                    url=cfg.get("url", ""),
                    command=cfg.get("command", ""),
                    headers=headers,
                )
                connected = await conn.connect()
                if connected:
                    cls._mcp_connections[server_id] = conn
                else:
                    logger.warning(f"MCP 서버 연결 실패, 건너뜀: {server_id}")
                    continue

            # 도구 목록 조회
            try:
                mcp_tools = await cls._mcp_connections[server_id].list_tools()
                tools.extend(mcp_tools)
            except Exception as e:
                logger.error(f"MCP 도구 로드 실패 ({server_id}): {e}")

        return tools

    @classmethod
    async def disconnect_all(cls):
        """모든 MCP 연결 해제 (앱 셧다운 시)"""
        for server_id, conn in list(cls._mcp_connections.items()):
            try:
                await conn.disconnect()
                logger.info(f"MCP 서버 연결 해제: {server_id}")
            except Exception as e:
                logger.error(f"MCP 연결 해제 실패 ({server_id}): {e}")
        cls._mcp_connections.clear()

    @classmethod
    async def disconnect_server(cls, server_id: str):
        """특정 MCP 서버 연결 해제"""
        if server_id in cls._mcp_connections:
            try:
                await cls._mcp_connections[server_id].disconnect()
                del cls._mcp_connections[server_id]
            except Exception as e:
                logger.error(f"MCP 연결 해제 실패 ({server_id}): {e}")
