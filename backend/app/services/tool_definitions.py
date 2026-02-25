"""
학습 데이터용 도구 정의 (OpenAI function calling 스키마)

시스템이 사용하는 모든 도구를 표준 OpenAI tool 형식으로 정의합니다.
파인튜닝 데이터셋의 system 메시지에 포함됩니다.
"""
from typing import List, Optional

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "웹에서 최신 정보를 검색합니다. 시사, 뉴스, 실시간 정보가 필요할 때 사용합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "검색 쿼리"},
                    "provider": {
                        "type": "string",
                        "enum": ["ddg", "serper", "brave", "tavily"],
                        "description": "검색 엔진 (기본: ddg)",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vector_retrieval",
            "description": "지식 베이스에서 관련 문서를 검색합니다. 업로드된 문서 기반으로 답변할 때 사용합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "검색 쿼리"},
                    "kb_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "검색할 지식 베이스 ID 목록",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "반환할 문서 수 (기본: 5)",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mcp_tools",
            "description": "외부 MCP 도구 서버를 호출하여 작업을 수행합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "도구에 전달할 메시지"},
                    "mcp_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "호출할 MCP 도구 ID 목록",
                    },
                },
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_closed_orders",
            "description": "마감된 주문 내역을 조회합니다. 물류 프로세스의 첫 번째 단계입니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "주문 조회 SQL 쿼리 또는 자연어 요청"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "convert_address_to_coordinates",
            "description": "주문 데이터의 주소를 위도/경도 좌표로 변환합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_data": {"type": "string", "description": "주문 데이터 (JSON 문자열)"},
                },
                "required": ["order_data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_dispatch_algorithm",
            "description": "좌표를 기반으로 가까운 주문끼리 묶어 차량을 배정합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "coordinate_data": {"type": "string", "description": "좌표 데이터 (JSON 문자열)"},
                },
                "required": ["coordinate_data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_vehicle_routes",
            "description": "배정된 차량별로 최적의 이동 경로를 생성합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dispatch_data": {"type": "string", "description": "배차 데이터 (JSON 문자열)"},
                },
                "required": ["dispatch_data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_delivery_instructions",
            "description": "기사님에게 전송할 배송 지시서를 생성합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "route_data": {"type": "string", "description": "경로 데이터 (JSON 문자열)"},
                },
                "required": ["route_data"],
            },
        },
    },
]


def get_tool_definitions(filter_names: Optional[List[str]] = None) -> list:
    """
    도구 정의를 반환합니다.

    Args:
        filter_names: 특정 도구만 필터링 (None이면 전체 반환)

    Returns:
        OpenAI function calling 스키마 리스트
    """
    if filter_names:
        return [t for t in TOOL_DEFINITIONS if t["function"]["name"] in filter_names]
    return TOOL_DEFINITIONS
