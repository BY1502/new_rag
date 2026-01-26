from langchain_community.tools import DuckDuckGoSearchResults
from langchain_core.tools import tool

# 1. 기본 웹 검색 도구
def get_web_search_tool():
    return DuckDuckGoSearchResults(backend="api", num_results=3)

# 2. 커스텀 계산 도구 (예시)
@tool
def calculator(expression: str) -> str:
    """Calculates a mathematical expression."""
    try:
        return str(eval(expression))
    except:
        return "Invalid expression"

class ToolRegistry:
    @staticmethod
    def get_tools(active_mcp_ids: list):
        """
        활성화된 ID에 따라 도구 리스트를 반환합니다.
        추후 실제 MCP Client를 여기에 연결하여 외부 도구를 가져옵니다.
        """
        tools = []
        
        # 현재는 ID와 상관없이 테스트를 위해 웹 검색 도구는 항상 포함하거나,
        # 프론트엔드에서 'web-search'라는 ID를 보낸다고 가정합니다.
        # (실제로는 active_mcp_ids를 순회하며 매핑해야 함)
        
        if True: # 테스트를 위해 항상 웹 검색 활성화
            tools.append(get_web_search_tool())
            
        # 예시: 계산기 도구
        # tools.append(calculator)
        
        return tools