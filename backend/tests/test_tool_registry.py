"""
tool_registry.py 단위 테스트
- calculator 도구
- ToolRegistry 클래스
- 도구 활성화/비활성화
"""
import pytest
from app.services.tool_registry import (
    calculator,
    get_web_search_tool,
    ToolRegistry,
    BUILTIN_TOOLS,
)


class TestCalculator:
    """계산기 도구 테스트"""

    def test_addition(self):
        assert calculator.invoke("2 + 3") == "5"

    def test_subtraction(self):
        assert calculator.invoke("10 - 4") == "6"

    def test_multiplication(self):
        assert calculator.invoke("3 * 7") == "21"

    def test_division(self):
        assert calculator.invoke("10 / 4") == "2.5"

    def test_power(self):
        assert calculator.invoke("2 ** 3") == "8"

    def test_complex_expression(self):
        assert calculator.invoke("(2 + 3) * 4") == "20"

    def test_negative_number(self):
        assert calculator.invoke("-5 + 3") == "-2"

    def test_invalid_expression(self):
        result = calculator.invoke("abc")
        assert "오류" in result or "에러" in result or "error" in result.lower()

    def test_division_by_zero(self):
        result = calculator.invoke("1 / 0")
        assert "오류" in result or "에러" in result or "error" in result.lower()

    def test_disallowed_operations(self):
        """eval 대신 AST 기반이므로 import 등 차단"""
        result = calculator.invoke("__import__('os').system('ls')")
        assert "오류" in result or "에러" in result or "error" in result.lower()


class TestBuiltinTools:
    """내장 도구 레지스트리 테스트"""

    def test_web_search_in_registry(self):
        assert "web-search" in BUILTIN_TOOLS

    def test_calculator_in_registry(self):
        assert "calculator" in BUILTIN_TOOLS

    def test_web_search_tool_creation(self):
        tool = get_web_search_tool(num_results=3)
        assert tool is not None

    def test_calculator_factory(self):
        tool = BUILTIN_TOOLS["calculator"]["factory"]()
        assert tool is not None


class TestToolRegistry:
    """ToolRegistry 클래스 테스트"""

    def test_get_tools_empty(self):
        """active_mcp_ids가 None이면 빈 리스트"""
        tools = ToolRegistry.get_tools(None)
        assert tools == []

    def test_get_tools_empty_list(self):
        """빈 리스트면 빈 리스트"""
        tools = ToolRegistry.get_tools([])
        assert tools == []

    def test_get_tools_calculator(self):
        """calculator 활성화"""
        tools = ToolRegistry.get_tools(["calculator"])
        assert len(tools) == 1

    def test_get_tools_unknown_id(self):
        """알 수 없는 도구 ID 무시"""
        tools = ToolRegistry.get_tools(["unknown-tool"])
        assert len(tools) == 0

    def test_get_tools_mixed(self):
        """여러 도구 동시 활성화"""
        tools = ToolRegistry.get_tools(["calculator", "web-search"])
        assert len(tools) == 2

    def test_get_available_tools(self):
        """사용 가능한 도구 목록 반환"""
        tools = ToolRegistry.get_available_tools()
        assert len(tools) >= 2
        ids = [t["id"] for t in tools]
        assert "web-search" in ids
        assert "calculator" in ids

    def test_available_tools_format(self):
        """도구 목록 형식 확인"""
        tools = ToolRegistry.get_available_tools()
        for tool in tools:
            assert "id" in tool
            assert "name" in tool
            assert "description" in tool
            assert "type" in tool

    def test_connect_mcp_server(self):
        """MCP 서버 연결 (스텁)"""
        result = ToolRegistry.connect_mcp_server("test-server", "http://localhost:9999")
        assert result is True

    def test_disconnect_mcp_server(self):
        """MCP 서버 연결 해제"""
        result = ToolRegistry.disconnect_mcp_server("nonexistent-server")
        assert result is True
