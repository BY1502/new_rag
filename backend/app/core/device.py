"""
GPU 메모리 인식 디바이스 선택 유틸리티

Ollama가 GPU를 점유하는 환경에서, 여유 VRAM을 확인하여
임베딩/리랭커 모델을 GPU 또는 CPU에 자동 배치합니다.
"""
import logging

logger = logging.getLogger(__name__)

# 모델별 예상 VRAM 사용량 (MB)
_MODEL_VRAM_ESTIMATES = {
    "BAAI/bge-m3": 2200,
    "BAAI/bge-reranker-v2-m3": 1100,
    "openai/clip-vit-base-patch32": 600,
    "Salesforce/blip-image-captioning-base": 1000,
}

# 기본 여유 마진 (MB) - 모델 로딩 오버헤드 + 추론 시 임시 메모리
_MARGIN_MB = 512


def get_device(model_name: str = "", required_vram_mb: int = 0) -> str:
    """
    GPU 여유 메모리를 확인하여 적절한 디바이스를 반환합니다.

    Args:
        model_name: 모델명 (예상 VRAM 테이블에서 자동 조회)
        required_vram_mb: 직접 지정할 필요 VRAM (MB). 0이면 model_name으로 추정

    Returns:
        "cuda", "mps", 또는 "cpu"
    """
    from app.core.config import settings

    configured = getattr(settings, "EMBEDDING_DEVICE", "auto")

    # 강제 지정된 경우 그대로 반환
    if configured in ("cpu", "cuda", "mps"):
        return configured

    # auto 모드: GPU 여유 메모리 확인
    try:
        import torch

        if torch.cuda.is_available():
            free_mb = _get_cuda_free_mb()
            needed_mb = required_vram_mb or _MODEL_VRAM_ESTIMATES.get(model_name, 1500)
            total_needed = needed_mb + _MARGIN_MB

            if free_mb >= total_needed:
                logger.info(
                    f"[Device] GPU 선택: {model_name or 'model'} "
                    f"(필요: {needed_mb}MB + 마진 {_MARGIN_MB}MB = {total_needed}MB, "
                    f"여유: {free_mb:.0f}MB)"
                )
                return "cuda"
            else:
                logger.info(
                    f"[Device] CPU 폴백: {model_name or 'model'} "
                    f"(필요: {total_needed}MB, 여유: {free_mb:.0f}MB 부족)"
                )
                return "cpu"

        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"

    except Exception as e:
        logger.warning(f"[Device] GPU 감지 실패: {e}")

    return "cpu"


def _get_cuda_free_mb() -> float:
    """현재 CUDA GPU의 여유 메모리(MB)를 반환합니다."""
    import torch

    free_bytes, total_bytes = torch.cuda.mem_get_info(0)
    free_mb = free_bytes / (1024 * 1024)
    total_mb = total_bytes / (1024 * 1024)
    logger.debug(f"[Device] GPU 메모리: {free_mb:.0f}MB 여유 / {total_mb:.0f}MB 전체")
    return free_mb
