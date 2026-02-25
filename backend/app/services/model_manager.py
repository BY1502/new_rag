"""
모델 다운로드 및 관리 서비스

HuggingFace에서 파인튜닝용 베이스 모델을 다운로드하고 관리합니다.
"""
import asyncio
import logging
from pathlib import Path
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class ModelManager:
    """모델 다운로드 및 관리"""

    # 다운로드 상태 추적 (in-memory)
    _download_status: dict = {}

    @classmethod
    def _get_storage_dir(cls) -> Path:
        """모델 저장 디렉토리"""
        return Path(getattr(settings, "MODEL_STORAGE_DIR", "/home/ojt/new_rag/models"))

    @classmethod
    def _get_model_path(cls, model_name: str) -> Path:
        """모델의 로컬 경로"""
        safe_name = model_name.replace("/", "--")
        return cls._get_storage_dir() / "base_models" / safe_name

    @classmethod
    def is_downloaded(cls, model_name: str) -> bool:
        """모델이 다운로드되었는지 확인"""
        model_path = cls._get_model_path(model_name)
        if not model_path.exists():
            return False
        # safetensors 또는 bin 파일이 있으면 다운로드 완료로 판단
        has_weights = (
            list(model_path.glob("*.safetensors"))
            or list(model_path.glob("*.bin"))
            or list(model_path.glob("model-*.safetensors"))
        )
        return bool(has_weights)

    @classmethod
    def list_downloaded(cls) -> list[dict]:
        """다운로드된 모델 목록"""
        base_dir = cls._get_storage_dir() / "base_models"
        if not base_dir.exists():
            return []

        models = []
        for d in sorted(base_dir.iterdir()):
            if not d.is_dir():
                continue
            model_name = d.name.replace("--", "/")
            size_bytes = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
            models.append({
                "name": model_name,
                "path": str(d),
                "size_gb": round(size_bytes / (1024**3), 2),
                "ready": cls.is_downloaded(model_name),
            })
        return models

    @classmethod
    def get_status(cls, model_name: str) -> dict:
        """다운로드 상태 조회"""
        if cls.is_downloaded(model_name):
            return {"status": "done", "progress": 100}
        return cls._download_status.get(model_name, {"status": "not_started", "progress": 0})

    @classmethod
    async def download_model(cls, model_name: str) -> dict:
        """
        HuggingFace에서 모델 다운로드 (백그라운드 실행용)

        Returns:
            {"success": bool, "message": str, "path": str}
        """
        if cls.is_downloaded(model_name):
            path = cls._get_model_path(model_name)
            return {"success": True, "message": "이미 다운로드되어 있습니다", "path": str(path)}

        cls._download_status[model_name] = {"status": "downloading", "progress": 10}
        model_path = cls._get_model_path(model_name)
        model_path.mkdir(parents=True, exist_ok=True)

        loop = asyncio.get_running_loop()

        def _download():
            from huggingface_hub import snapshot_download

            logger.info(f"[ModelManager] 다운로드 시작: {model_name} → {model_path}")
            snapshot_download(
                repo_id=model_name,
                local_dir=str(model_path),
                local_dir_use_symlinks=False,
            )
            logger.info(f"[ModelManager] 다운로드 완료: {model_name}")

        try:
            await loop.run_in_executor(None, _download)
            cls._download_status[model_name] = {"status": "done", "progress": 100}
            return {"success": True, "message": "다운로드 완료", "path": str(model_path)}
        except Exception as e:
            logger.error(f"[ModelManager] 다운로드 실패: {model_name} - {e}")
            cls._download_status[model_name] = {"status": "error", "progress": 0, "error": str(e)}
            return {"success": False, "message": str(e), "path": ""}

    @classmethod
    def get_training_output_dir(cls, output_name: str) -> Path:
        """학습 결과 저장 디렉토리"""
        output_dir = cls._get_storage_dir() / "training_outputs" / output_name
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir
