"""Local translation engine setup and inference."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

MODEL_ID = "Helsinki-NLP/opus-mt-en-zh"
MODEL_REVISION = "408d9bc410a388e1d9aef112a2daba955b945255"
MAX_INPUT_TOKENS = 512
MAX_OUTPUT_TOKENS = 256
CACHE_DIR = Path.home() / ".cache" / "phraseweave" / "lexical-chunks"
SOURCE_MODEL_DIR = CACHE_DIR / "opus-mt-en-zh" / MODEL_REVISION
MODEL_FILES = (
    "config.json",
    "pytorch_model.bin",
    "source.spm",
    "target.spm",
    "tokenizer_config.json",
    "vocab.json",
)


def model_status() -> dict[str, bool]:
    return {
        "model_downloaded": all((SOURCE_MODEL_DIR / name).is_file() for name in MODEL_FILES),
    }


def install_model(progress: Any = None) -> None:
    from huggingface_hub import snapshot_download

    if model_status()["model_downloaded"]:
        if progress:
            progress("Helsinki translation model is already downloaded")
        return

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if progress:
        progress("Downloading the pinned Helsinki model")
    snapshot_download(
        repo_id=MODEL_ID,
        revision=MODEL_REVISION,
        local_dir=SOURCE_MODEL_DIR,
        allow_patterns=[
            "config.json",
            "generation_config.json",
            "pytorch_model.bin",
            "source.spm",
            "target.spm",
            "tokenizer_config.json",
            "vocab.json",
        ],
    )

    if not model_status()["model_downloaded"]:
        raise RuntimeError("The Helsinki model download is incomplete. Restart the service to retry.")


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


def translate_sentences(sentences: list[str]) -> list[str]:
    tokenizer = _load_tokenizer()
    _prepare_sentences(sentences, tokenizer)
    return _translate_transformers(sentences, tokenizer)


def _translate_transformers(sentences: list[str], tokenizer: Any) -> list[str]:
    import torch
    from transformers import AutoModelForSeq2SeqLM

    if not model_status()["model_downloaded"]:
        raise RuntimeError("The Helsinki translation model is not downloaded.")
    torch.set_num_threads(max(1, min(os.cpu_count() or 1, 8)))
    model = AutoModelForSeq2SeqLM.from_pretrained(
        SOURCE_MODEL_DIR, local_files_only=True
    ).to("cpu")
    inputs = tokenizer(
        sentences,
        return_tensors="pt",
        padding=True,
        truncation=False,
    )
    with torch.inference_mode():
        output_ids = model.generate(
            **inputs,
            num_beams=4,
            max_new_tokens=MAX_OUTPUT_TOKENS,
            early_stopping=True,
        )
    return [text.strip() for text in tokenizer.batch_decode(output_ids, skip_special_tokens=True)]
