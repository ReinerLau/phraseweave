"""Local model setup and sentence translation through local or public inference."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

MODEL_ID = "tencent/Hy-MT2-1.8B"
MODEL_REVISION = "9a341cd1b679d3efd23b46e847b01745a71ed792"
MAX_INPUT_TOKENS = 512
MAX_OUTPUT_TOKENS = 512
TRANSLATION_PROVIDERS = ("local", "index-translate")
INDEX_TRANSLATE_URL = "https://index-translate.bilibili.com/v1/chat/completions"
INDEX_TRANSLATE_MODEL = "Index-Translate-35B-A3B"
INDEX_TRANSLATE_TIMEOUT = 30
CACHE_DIR = Path.home() / ".cache" / "phraseweave" / "lexical-chunks"
SOURCE_MODEL_DIR = CACHE_DIR / "hy-mt2-1.8b" / MODEL_REVISION
MODEL_FILES = (
    "config.json",
    "model.safetensors",
    "chat_template.jinja",
    "tokenizer.json",
    "tokenizer_config.json",
)


def model_status() -> dict[str, bool]:
    return {
        "model_downloaded": all((SOURCE_MODEL_DIR / name).is_file() for name in MODEL_FILES),
    }


def install_model(progress: Any = None) -> None:
    from huggingface_hub import snapshot_download

    if model_status()["model_downloaded"]:
        if progress:
            progress("Hy-MT2 translation model is already downloaded")
        return

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if progress:
        progress("Downloading the pinned Hy-MT2 model")
    snapshot_download(
        repo_id=MODEL_ID,
        revision=MODEL_REVISION,
        local_dir=SOURCE_MODEL_DIR,
        allow_patterns=[*MODEL_FILES, "generation_config.json", "special_tokens_map.json", "LICENSE.txt"],
    )

    if not model_status()["model_downloaded"]:
        raise RuntimeError("The Hy-MT2 model download is incomplete. Generate again to retry.")


def _load_tokenizer() -> Any:
    from transformers import AutoTokenizer

    if not model_status()["model_downloaded"]:
        raise RuntimeError("Download the translation model before generating learning units.")
    return AutoTokenizer.from_pretrained(SOURCE_MODEL_DIR, local_files_only=True)


def _prepare_sentences(sentences: list[str], tokenizer: Any) -> list[list[int]]:
    encoded = tokenizer(sentences, add_special_tokens=True, truncation=False)
    input_ids = encoded["input_ids"]
    too_long = [index + 1 for index, ids in enumerate(input_ids) if len(ids) > MAX_INPUT_TOKENS]
    if too_long:
        joined = ", ".join(str(index) for index in too_long)
        raise RuntimeError(
            f"Sentence(s) {joined} exceed the model's {MAX_INPUT_TOKENS}-token input limit. "
            "Shorten or split the English text and try again."
        )
    return input_ids


def translate_sentences(
    sentences: list[str], provider: str = "local", progress: Any = None,
) -> list[str]:
    if provider not in TRANSLATION_PROVIDERS:
        raise ValueError("Choose a supported translation provider.")
    if provider == "index-translate":
        return _translate_index(sentences, progress)
    install_model(progress)
    tokenizer = _load_tokenizer()
    _prepare_sentences(sentences, tokenizer)
    return _translate_transformers(sentences, tokenizer)


def _translate_index(sentences: list[str], progress: Any = None) -> list[str]:
    translations = []
    for index, sentence in enumerate(sentences, start=1):
        if progress:
            progress(f"Index-Translate：正在翻译第 {index}/{len(sentences)} 句…")
        payload = {
            "model": INDEX_TRANSLATE_MODEL,
            "messages": [{
                "role": "user",
                "content": (
                    "请将以下英语文本翻译为中文，直接输出翻译结果，不要进行任何解释。\n\n"
                    f"{sentence}"
                ),
            }],
            "temperature": 0,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "stream": False,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        request = urllib.request.Request(
            INDEX_TRANSLATE_URL,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Index-Translate-Client/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=INDEX_TRANSLATE_TIMEOUT) as response:
                result = json.load(response)
            if not isinstance(result, dict):
                raise ValueError("响应不是 JSON 对象")
            choices = result.get("choices")
            if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
                raise ValueError("响应缺少译文")
            choice = choices[0]
            if choice.get("finish_reason") != "stop":
                raise ValueError("译文未完整生成，请缩短原句后重试")
            message = choice.get("message")
            content = message.get("content") if isinstance(message, dict) else None
            if not isinstance(content, str) or not content.strip():
                raise ValueError("返回了空译文或无效译文")
            if "<think>" in content or "</think>" in content:
                raise ValueError("响应包含推理内容，无法作为译文使用")
            translations.append(content.strip())
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"Index-Translate 第 {index} 句翻译失败（HTTP {error.code}），请重试或切换本地翻译。"
            ) from error
        except TimeoutError as error:
            raise RuntimeError(
                f"Index-Translate 第 {index} 句请求超时（30 秒），请重试或切换本地翻译。"
            ) from error
        except (urllib.error.URLError, OSError) as error:
            raise RuntimeError(
                f"Index-Translate 第 {index} 句无法连接公网服务，请检查网络或切换本地翻译。"
            ) from error
        except (ValueError, UnicodeError) as error:
            raise RuntimeError(f"Index-Translate 第 {index} 句翻译失败：{error}") from error
    return translations


def _translate_transformers(sentences: list[str], tokenizer: Any) -> list[str]:
    import torch
    from transformers import AutoModelForCausalLM

    if not model_status()["model_downloaded"]:
        raise RuntimeError("The Hy-MT2 translation model is not downloaded.")
    torch.set_num_threads(max(1, min(os.cpu_count() or 1, 8)))
    model = AutoModelForCausalLM.from_pretrained(
        SOURCE_MODEL_DIR, local_files_only=True, dtype=torch.bfloat16
    ).to("cpu")
    model.eval()
    translations = []
    for sentence in sentences:
        prompt = (
            "将以下文本翻译为中文，注意只需要输出翻译后的结果，不要额外解释：\n"
            f"{sentence}"
        )
        inputs = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        )
        with torch.inference_mode():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=MAX_OUTPUT_TOKENS,
                do_sample=False,
                repetition_penalty=1.05,
                pad_token_id=tokenizer.eos_token_id,
            )
        translation = tokenizer.decode(
            output_ids[0][inputs["input_ids"].shape[-1]:],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        ).strip()
        translations.append(translation)
    return translations
