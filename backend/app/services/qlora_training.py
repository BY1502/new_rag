"""
QLoRA Fine-Tuning 서비스

Unsloth + QLoRA(4-bit) 기반 실제 가중치 학습을 수행합니다.
학습 완료 후 GGUF 변환 → Ollama 등록까지 자동 처리합니다.

주의: GPU 24GB 중 Ollama가 대부분을 사용하므로,
학습 시에는 반드시 Ollama를 먼저 중지해야 합니다.
"""
import asyncio
import json
import logging
from pathlib import Path
from typing import Optional, Callable

from app.services.model_manager import ModelManager

logger = logging.getLogger(__name__)


def check_ollama_running() -> bool:
    """Ollama 서버가 실행 중인지 확인"""
    try:
        import httpx
        resp = httpx.get("http://localhost:11434/api/tags", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


def _run_training_sync(
    dataset_path: str,
    model_path: str,
    output_dir: str,
    output_name: str,
    num_epochs: int = 3,
    learning_rate: float = 2e-4,
    batch_size: int = 4,
    lora_r: int = 16,
    lora_alpha: int = 16,
    max_seq_length: int = 2048,
) -> dict:
    """
    동기 학습 함수 (run_in_executor에서 실행됨)

    Returns:
        {"success": bool, "message": str, "gguf_path": str, "metrics": dict}
    """
    try:
        from unsloth import FastLanguageModel
    except ImportError:
        # unsloth 없으면 peft + transformers 직접 사용
        logger.warning("unsloth not installed, falling back to peft + transformers")
        return _run_training_peft_fallback(
            dataset_path, model_path, output_dir, output_name,
            num_epochs, learning_rate, batch_size, lora_r, lora_alpha, max_seq_length,
        )

    from trl import SFTTrainer
    from transformers import TrainingArguments
    from datasets import load_dataset
    import torch

    logger.info(f"[QLoRA] 학습 시작: model={model_path}, dataset={dataset_path}")

    # 1. 모델 로드 (4-bit QLoRA)
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_path,
        max_seq_length=max_seq_length,
        dtype=None,
        load_in_4bit=True,
    )

    # 2. LoRA 적용
    model = FastLanguageModel.get_peft_model(
        model,
        r=lora_r,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_alpha=lora_alpha,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
    )

    # 3. 데이터셋 로드 + chat template 적용
    dataset = load_dataset("json", data_files=dataset_path, split="train")

    def formatting_func(examples):
        texts = []
        for messages in examples["messages"]:
            text = tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=False,
            )
            texts.append(text)
        return {"text": texts}

    dataset = dataset.map(formatting_func, batched=True, remove_columns=dataset.column_names)
    logger.info(f"[QLoRA] 데이터셋: {len(dataset)} examples")

    # 4. 학습 설정
    training_args = TrainingArguments(
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=max(1, 16 // batch_size),
        warmup_steps=5,
        num_train_epochs=num_epochs,
        learning_rate=learning_rate,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=1,
        output_dir=output_dir,
        optim="adamw_8bit",
        seed=42,
        save_strategy="epoch",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=max_seq_length,
        args=training_args,
    )

    # 5. 학습 실행
    result = trainer.train()
    train_loss = result.training_loss
    train_runtime = result.metrics.get("train_runtime", 0)

    logger.info(f"[QLoRA] 학습 완료: loss={train_loss:.4f}, time={train_runtime:.0f}s")

    # 6. LoRA adapter 저장
    adapter_dir = str(Path(output_dir) / "lora_adapter")
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)

    # 7. GGUF 변환
    gguf_path = None
    try:
        model.save_pretrained_gguf(
            output_dir, tokenizer, quantization_method="q4_k_m",
        )
        # unsloth이 생성하는 GGUF 파일명 탐색
        gguf_files = list(Path(output_dir).glob("*.gguf"))
        if gguf_files:
            gguf_path = str(gguf_files[0])
            logger.info(f"[QLoRA] GGUF 변환 완료: {gguf_path}")
    except Exception as e:
        logger.warning(f"[QLoRA] GGUF 변환 실패 (adapter만 저장됨): {e}")

    return {
        "success": True,
        "message": "학습 완료",
        "gguf_path": gguf_path,
        "adapter_path": adapter_dir,
        "metrics": {
            "train_loss": train_loss,
            "train_runtime_seconds": int(train_runtime),
            "num_examples": len(dataset),
            "num_epochs": num_epochs,
        },
    }


def _run_training_peft_fallback(
    dataset_path: str,
    model_path: str,
    output_dir: str,
    output_name: str,
    num_epochs: int = 3,
    learning_rate: float = 2e-4,
    batch_size: int = 4,
    lora_r: int = 16,
    lora_alpha: int = 16,
    max_seq_length: int = 2048,
) -> dict:
    """unsloth 없을 때 peft + transformers로 직접 학습"""
    from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from trl import SFTTrainer
    from datasets import load_dataset
    import torch

    logger.info(f"[QLoRA-PEFT] 학습 시작: model={model_path}")

    # 4-bit 양자화 설정
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_path, quantization_config=bnb_config, device_map="auto", trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)

    # LoRA 설정
    lora_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)

    # 데이터셋
    dataset = load_dataset("json", data_files=dataset_path, split="train")

    def formatting_func(examples):
        texts = []
        for messages in examples["messages"]:
            text = tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=False,
            )
            texts.append(text)
        return {"text": texts}

    dataset = dataset.map(formatting_func, batched=True, remove_columns=dataset.column_names)

    # 학습
    training_args = TrainingArguments(
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=max(1, 16 // batch_size),
        warmup_steps=5,
        num_train_epochs=num_epochs,
        learning_rate=learning_rate,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=1,
        output_dir=output_dir,
        optim="adamw_8bit",
        seed=42,
        save_strategy="epoch",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=max_seq_length,
        args=training_args,
    )

    result = trainer.train()

    # LoRA adapter 저장
    adapter_dir = str(Path(output_dir) / "lora_adapter")
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)

    return {
        "success": True,
        "message": "학습 완료 (PEFT fallback, GGUF 변환은 수동 필요)",
        "gguf_path": None,
        "adapter_path": adapter_dir,
        "metrics": {
            "train_loss": result.training_loss,
            "train_runtime_seconds": int(result.metrics.get("train_runtime", 0)),
            "num_examples": len(dataset),
            "num_epochs": num_epochs,
        },
    }


async def run_qlora_training(
    dataset_path: str,
    base_model: str,
    output_name: str,
    num_epochs: int = 3,
    learning_rate: float = 2e-4,
    batch_size: int = 4,
    lora_r: int = 16,
) -> dict:
    """
    QLoRA 학습 실행 (async wrapper)

    1. Ollama 실행 여부 확인
    2. 모델 경로 확인
    3. 학습 실행 (run_in_executor)
    4. GGUF → Ollama 등록
    """
    # Ollama 충돌 방지
    if check_ollama_running():
        return {
            "success": False,
            "message": "Ollama가 실행 중입니다. GPU 메모리 충돌 방지를 위해 먼저 중지해주세요.\n"
                       "$ sudo systemctl stop ollama",
            "metrics": {},
        }

    # 모델 확인
    if not ModelManager.is_downloaded(base_model):
        return {
            "success": False,
            "message": f"베이스 모델이 다운로드되지 않았습니다: {base_model}\n"
                       "학습 탭에서 먼저 모델을 다운로드해주세요.",
            "metrics": {},
        }

    model_path = str(ModelManager._get_model_path(base_model))
    output_dir = str(ModelManager.get_training_output_dir(output_name))

    # 학습 실행
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        _run_training_sync,
        dataset_path, model_path, output_dir, output_name,
        num_epochs, learning_rate, batch_size, lora_r, lora_r,
    )

    # GGUF → Ollama 등록
    if result.get("success") and result.get("gguf_path"):
        try:
            gguf_path = result["gguf_path"]
            logger.info(f"[QLoRA] Ollama 등록: {output_name} ← {gguf_path}")

            modelfile = f"FROM {gguf_path}\nPARAMETER temperature 0.7\nPARAMETER num_ctx 4096\n"
            import tempfile
            mf_path = Path(tempfile.gettempdir()) / f"Modelfile_{output_name}"
            mf_path.write_text(modelfile)

            process = await asyncio.create_subprocess_exec(
                "ollama", "create", output_name, "-f", str(mf_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                result["message"] += f"\nOllama 모델 등록 완료: {output_name}"
                logger.info(f"[QLoRA] Ollama 등록 성공: {output_name}")
            else:
                result["message"] += f"\nOllama 등록 실패: {stderr.decode()}"
                logger.warning(f"[QLoRA] Ollama 등록 실패: {stderr.decode()}")
        except Exception as e:
            result["message"] += f"\nOllama 등록 중 오류: {e}"
            logger.warning(f"[QLoRA] Ollama 등록 오류: {e}")

    return result
