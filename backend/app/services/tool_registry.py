"""
도구 레지스트리 - MCP 서버 및 내장 도구 관리
"""
import ast
import operator
import logging
from typing import List, Dict, Any, Optional
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
# 도구 레지스트리
# ============================================================

# 내장 도구 ID 매핑
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


class ToolRegistry:
    """
    MCP 서버 및 내장 도구를 관리하는 레지스트리
    """

    # MCP 서버 연결 캐시 (추후 실제 MCP 클라이언트 연결용)
    _mcp_connections: Dict[str, Any] = {}

    @classmethod
    def get_available_tools(cls) -> List[Dict[str, str]]:
        """
        사용 가능한 모든 도구 목록 반환 (프론트엔드 표시용)
        """
        tools = []
        for tool_id, tool_info in BUILTIN_TOOLS.items():
            tools.append({
                "id": tool_id,
                "name": tool_info["name"],
                "description": tool_info["description"],
                "type": "builtin"
            })

        # TODO: MCP 서버에서 가져온 도구 추가
        # for mcp_id, connection in cls._mcp_connections.items():
        #     tools.extend(connection.list_tools())

        return tools

    @classmethod
    def get_tools(cls, active_mcp_ids: Optional[List[str]] = None) -> List[BaseTool]:
        """
        활성화된 ID에 따라 도구 리스트를 반환합니다.

        Args:
            active_mcp_ids: 활성화할 도구/MCP 서버 ID 목록
                           None이면 빈 리스트 반환

        Returns:
            활성화된 도구들의 리스트
        """
        if not active_mcp_ids:
            return []

        tools = []

        for tool_id in active_mcp_ids:
            # 1. 내장 도구 확인
            if tool_id in BUILTIN_TOOLS:
                try:
                    tool_instance = BUILTIN_TOOLS[tool_id]["factory"]()
                    tools.append(tool_instance)
                    logger.debug(f"내장 도구 활성화: {tool_id}")
                except Exception as e:
                    logger.error(f"도구 생성 실패 ({tool_id}): {e}")
                continue

            # 2. MCP 서버 도구 확인
            if tool_id in cls._mcp_connections:
                try:
                    mcp_tools = cls._get_mcp_tools(tool_id)
                    tools.extend(mcp_tools)
                    logger.debug(f"MCP 도구 활성화: {tool_id}")
                except Exception as e:
                    logger.error(f"MCP 도구 로드 실패 ({tool_id}): {e}")
                continue

            # 3. 알 수 없는 도구 ID
            logger.warning(f"알 수 없는 도구 ID: {tool_id}")

        return tools

    @classmethod
    def _get_mcp_tools(cls, mcp_id: str) -> List[BaseTool]:
        """
        MCP 서버에서 도구를 가져옵니다.
        TODO: 실제 MCP 클라이언트 구현
        """
        # MCP 프로토콜 구현 시 여기에 추가
        return []

    @classmethod
    def connect_mcp_server(cls, server_id: str, server_url: str, server_type: str = "sse") -> bool:
        """
        MCP 서버에 연결합니다.

        Args:
            server_id: 서버 고유 ID
            server_url: 서버 엔드포인트 URL
            server_type: 연결 타입 (sse, stdio)

        Returns:
            연결 성공 여부
        """
        try:
            # TODO: 실제 MCP 클라이언트 연결 구현
            # if server_type == "sse":
            #     client = MCPSSEClient(server_url)
            # elif server_type == "stdio":
            #     client = MCPStdioClient(server_url)
            # cls._mcp_connections[server_id] = client

            logger.info(f"MCP 서버 연결: {server_id} ({server_url})")
            return True
        except Exception as e:
            logger.error(f"MCP 서버 연결 실패: {e}")
            return False

    @classmethod
    def disconnect_mcp_server(cls, server_id: str) -> bool:
        """MCP 서버 연결 해제"""
        if server_id in cls._mcp_connections:
            try:
                # cls._mcp_connections[server_id].close()
                del cls._mcp_connections[server_id]
                logger.info(f"MCP 서버 연결 해제: {server_id}")
                return True
            except Exception as e:
                logger.error(f"MCP 서버 연결 해제 실패: {e}")
                return False
        return True
