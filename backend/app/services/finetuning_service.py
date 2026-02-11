"""
파인튜닝 서비스 - Ollama 모델 학습
"""
import asyncio
import logging
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


class FineTuningService:
    """Ollama 파인튜닝 서비스"""

    @staticmethod
    def generate_modelfile(
        base_model: str,
        dataset_path: str,
        output_name: str,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> str:
        """Ollama Modelfile 생성"""
        modelfile_content = f"""FROM {base_model}

# 파인튜닝된 모델 설정
PARAMETER temperature {temperature}
PARAMETER num_ctx 4096
PARAMETER num_predict 512

"""
        if system_prompt:
            modelfile_content += f'SYSTEM """{system_prompt}"""\n\n'

        # 어댑터 학습은 Ollama에서 아직 지원하지 않으므로
        # 대신 ADAPTER나 MESSAGE로 학습 데이터 참조
        # 현재는 기본 모델 + 시스템 프롬프트만 사용
        modelfile_content += f"""# 학습 데이터: {dataset_path}
# 이 모델은 {base_model}을 기반으로 생성되었습니다.
"""
        return modelfile_content

    @staticmethod
    async def create_ollama_model(
        modelfile_path: str,
        output_model_name: str,
    ) -> tuple[bool, str]:
        """Ollama 모델 생성 (ollama create)"""
        try:
            cmd = ["ollama", "create", output_model_name, "-f", modelfile_path]

            logger.info(f"Running: {' '.join(cmd)}")

            # 비동기 프로세스 실행
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                logger.info(f"Model created successfully: {output_model_name}")
                return True, stdout.decode()
            else:
                error_msg = stderr.decode() or stdout.decode()
                logger.error(f"Model creation failed: {error_msg}")
                return False, error_msg

        except FileNotFoundError:
            return False, "Ollama CLI를 찾을 수 없습니다. Ollama가 설치되어 있는지 확인하세요."
        except Exception as e:
            logger.exception(f"Ollama model creation failed: {e}")
            return False, str(e)

    @staticmethod
    async def delete_ollama_model(model_name: str) -> bool:
        """Ollama 모델 삭제"""
        try:
            cmd = ["ollama", "rm", model_name]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()
            return process.returncode == 0
        except Exception as e:
            logger.error(f"Model deletion failed: {e}")
            return False

    @staticmethod
    async def list_ollama_models() -> list[str]:
        """Ollama 모델 목록 조회"""
        try:
            cmd = ["ollama", "list"]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()

            if process.returncode != 0:
                return []

            # 출력 파싱
            lines = stdout.decode().strip().split("\n")
            if len(lines) <= 1:
                return []

            models = []
            for line in lines[1:]:  # 헤더 건너뛰기
                parts = line.split()
                if parts:
                    models.append(parts[0])  # 첫 번째 컬럼이 모델 이름

            return models

        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            return []

    @staticmethod
    def save_modelfile(content: str, job_id: str) -> str:
        """Modelfile을 임시 디렉토리에 저장"""
        temp_dir = Path(tempfile.gettempdir()) / "rag_ai_modelfiles"
        temp_dir.mkdir(exist_ok=True)

        modelfile_path = temp_dir / f"Modelfile_{job_id}"
        modelfile_path.write_text(content, encoding="utf-8")

        return str(modelfile_path)
