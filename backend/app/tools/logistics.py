from langchain_core.tools import tool
import json
import random

# [Tool 1] 마감된 주문 조회 (T2SQL)
@tool
def query_closed_orders(query: str) -> str:
    """
    [Step 1] 마감된 주문 내역을 조회합니다. 
    자연어로 질문하면 SQL로 변환하여 RDB에서 데이터를 가져옵니다.
    입력 예시: "오늘 마감된 서울 지역 주문 보여줘"
    """
    # 실제 환경에서는 DB 연결 (settings.DATABASE_URL)
    # db = SQLDatabase.from_uri("sqlite:///logistics.db") 
    # chain = SQLDatabaseChain.from_llm(llm, db)
    # return chain.run(query)
    
    # [Mock Data] 테스트를 위한 가상 데이터 반환
    return json.dumps([
        {"order_id": "ORD-001", "address": "서울특별시 강남구 테헤란로 123", "items": "냉장고", "status": "CLOSED"},
        {"order_id": "ORD-002", "address": "서울특별시 서초구 서초대로 456", "items": "세탁기", "status": "CLOSED"},
        {"order_id": "ORD-003", "address": "경기도 성남시 분당구 판교로 789", "items": "TV", "status": "CLOSED"}
    ], ensure_ascii=False)

# [Tool 2] 주소 좌표 변환 (Geocoding)
@tool
def convert_address_to_coordinates(order_data_str: str) -> str:
    """
    [Step 2] 주문 데이터의 주소를 위도/경도 좌표로 변환합니다.
    입력: 주문 JSON 문자열
    """
    try:
        orders = json.loads(order_data_str)
        # 실제로는 geopy 사용: Geocoder().geocode(address)
        
        # [Mock Logic]
        for order in orders:
            # 서울 근처 임의 좌표 생성
            order["lat"] = 37.5 + random.uniform(-0.1, 0.1)
            order["lng"] = 127.0 + random.uniform(-0.1, 0.1)
            
        return json.dumps(orders, ensure_ascii=False)
    except Exception as e:
        return f"Error converting coordinates: {str(e)}"

# [Tool 3] 배차 알고리즘 실행
@tool
def run_dispatch_algorithm(coordinate_data_str: str) -> str:
    """
    [Step 3] 좌표를 기반으로 가까운 주문끼리 묶어 차량을 배정합니다.
    입력: 좌표가 포함된 주문 JSON
    """
    orders = json.loads(coordinate_data_str)
    
    # [Mock Logic] 2개씩 묶어서 배차
    dispatches = []
    chunk_size = 2
    for i in range(0, len(orders), chunk_size):
        batch = orders[i:i+chunk_size]
        vehicle_id = f"CAR-{random.randint(100, 999)}"
        dispatches.append({"vehicle_id": vehicle_id, "orders": batch})
        
    return json.dumps(dispatches, ensure_ascii=False)

# [Tool 4] 차량 별 루트 생성
@tool
def generate_vehicle_routes(dispatch_data_str: str) -> str:
    """
    [Step 4] 배정된 차량별로 최적의 이동 경로(Sequence)를 생성합니다.
    """
    dispatches = json.loads(dispatch_data_str)
    
    for dispatch in dispatches:
        # [Mock Logic] 단순 순서대로 경로 지정
        route = [o["address"] for o in dispatch["orders"]]
        dispatch["route_path"] = " -> ".join(route)
        dispatch["estimated_time"] = f"{random.randint(30, 120)} mins"
        
    return json.dumps(dispatches, ensure_ascii=False)

# [Tool 5] 기사 별 배송 지시 생성
@tool
def generate_delivery_instructions(route_data_str: str) -> str:
    """
    [Step 5] 최종적으로 기사님에게 전송할 배송 지시서를 생성합니다.
    """
    routes = json.loads(route_data_str)
    instructions = []
    
    for r in routes:
        driver_id = f"DRIVER-{random.randint(1, 50)}"
        msg = f"[지시서] 기사 {driver_id}님, 차량 {r['vehicle_id']}로 {r['route_path']} 경로 운행 바랍니다. 예상시간: {r['estimated_time']}"
        instructions.append(msg)
        
    return "\n".join(instructions)

def get_logistics_tools():
    return [
        query_closed_orders,
        convert_address_to_coordinates,
        run_dispatch_algorithm,
        generate_vehicle_routes,
        generate_delivery_instructions
    ]