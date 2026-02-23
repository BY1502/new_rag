"""
파인튜닝 서비스 - Ollama 모델 학습
Ollama는 LoRA fine-tuning을 지원하지 않으므로
SYSTEM 프롬프트 + MESSAGE (few-shot 예제) 방식으로 모델을 커스터마이징합니다.
"""
import asyncio
import json
import logging
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Modelfile에 포함할 최대 예제 수 (너무 많으면 context 초과)
MAX_FEWSHOT_EXAMPLES = 20


class FineTuningService:
    """Ollama 파인튜닝 서비스"""

    @staticmethod
    def _load_dataset_examples(dataset_path: str, max_examples: int = MAX_FEWSHOT_EXAMPLES) -> list[dict]:
        """JSONL 데이터셋에서 학습 예제 로드"""
        examples = []
        try:
            path = Path(dataset_path)
            if not path.exists():
                logger.warning(f"Dataset file not found: {dataset_path}")
                return []

            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        examples.append(entry)
                    except json.JSONDecodeError:
                        continue

                    if len(examples) >= max_examples:
                        break

            logger.info(f"Loaded {len(examples)} examples from {dataset_path}")
            return examples
        except Exception as e:
            logger.error(f"Failed to load dataset: {e}")
            return []

    @staticmethod
    def generate_modelfile(
        base_model: str,
        dataset_path: str,
        output_name: str,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> str:
        """Ollama Modelfile 생성 (SYSTEM + MESSAGE few-shot)"""
        modelfile_content = f"""FROM {base_model}

PARAMETER temperature {temperature}
PARAMETER num_ctx 4096
PARAMETER num_predict 512

"""
        # SYSTEM 프롬프트
        if system_prompt:
            modelfile_content += f'SYSTEM """{system_prompt}"""\n\n'
        else:
            modelfile_content += 'SYSTEM """You are a helpful AI assistant trained with user feedback. Answer questions accurately based on the examples you have learned."""\n\n'

        # JSONL에서 학습 데이터를 MESSAGE로 주입 (few-shot)
        examples = FineTuningService._load_dataset_examples(dataset_path)

        if examples:
            modelfile_content += f"# {len(examples)}개 학습 예제 (from {dataset_path})\n"
            for ex in examples:
                # chat format: {"messages": [{"role": "user", ...}, {"role": "assistant", ...}]}
                if "messages" in ex:
                    for msg in ex["messages"]:
                        role = msg.get("role", "user")
                        content = msg.get("content", "").replace('"""', '\\"""')
                        modelfile_content += f'MESSAGE {role} """{content}"""\n'
                # completion format: {"prompt": ..., "completion": ...}
                elif "prompt" in ex and "completion" in ex:
                    prompt = ex["prompt"].replace('"""', '\\"""')
                    completion = ex["completion"].replace('"""', '\\"""')
                    modelfile_content += f'MESSAGE user """{prompt}"""\n'
                    modelfile_content += f'MESSAGE assistant """{completion}"""\n'
                # instruction format: {"instruction": ..., "response": ...}
                elif "instruction" in ex and "response" in ex:
                    instruction = ex["instruction"].replace('"""', '\\"""')
                    response = ex["response"].replace('"""', '\\"""')
                    modelfile_content += f'MESSAGE user """{instruction}"""\n'
                    modelfile_content += f'MESSAGE assistant """{response}"""\n'

            modelfile_content += "\n"
        else:
            modelfile_content += f"# 학습 데이터 없음: {dataset_path}\n"

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
