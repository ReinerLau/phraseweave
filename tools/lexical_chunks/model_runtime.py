"""Local translation engine setup and inference."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

MODEL_ID = "Helsinki-NLP/opus-mt-en-zh"
MODEL_REVISION = "408d9bc410a388e1d9aef112a2daba955b945255"
TARGET_PREFIX = ">>cmn_Hans<<"
MAX_INPUT_TOKENS = 512
MAX_OUTPUT_TOKENS = 256
CACHE_DIR = Path.home() / ".cache" / "phraseweave" / "lexical-chunks"
SOURCE_MODEL_DIR = CACHE_DIR / "opus-mt-en-zh" / MODEL_REVISION
CT2_MODEL_DIR = CACHE_DIR / "opus-mt-en-zh-ct2-int8" / MODEL_REVISION


def model_status() -> dict[str, bool]:
    return {
        "source_downloaded": (SOURCE_MODEL_DIR / "config.json").is_file(),
        "ctranslate2_ready": (CT2_MODEL_DIR / "model.bin").is_file(),
    }


def install_model(progress: Any = None) -> None:
    from ctranslate2.converters import TransformersConverter
    from huggingface_hub import snapshot_download

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

    if model_status()["ctranslate2_ready"]:
        if progress:
            progress("CTranslate2 model is already ready")
        return

    if progress:
        progress("Converting the model to INT8 CTranslate2 format")
    staged_dir = CT2_MODEL_DIR.with_name(CT2_MODEL_DIR.name + ".installing")
    if staged_dir.exists():
        shutil.rmtree(staged_dir)
    staged_dir.parent.mkdir(parents=True, exist_ok=True)
    try:
        TransformersConverter(str(SOURCE_MODEL_DIR)).convert(
            str(staged_dir), quantization="int8"
        )
        CT2_MODEL_DIR.parent.mkdir(parents=True, exist_ok=True)
        staged_dir.replace(CT2_MODEL_DIR)
    except Exception:
        if staged_dir.exists():
            shutil.rmtree(staged_dir)
        raise


def _load_tokenizer() -> Any:
    from transformers import AutoTokenizer

    if not model_status()["source_downloaded"]:
        raise RuntimeError("Download the translation model before generating learning units.")
    return AutoTokenizer.from_pretrained(SOURCE_MODEL_DIR, local_files_only=True)


def _prepare_sentences(sentences: list[str], tokenizer: Any) -> tuple[list[str], list[list[int]]]:
    prefixed = [f"{TARGET_PREFIX} {sentence}" for sentence in sentences]
    encoded = tokenizer(prefixed, add_special_tokens=True, truncation=False)
    input_ids = encoded["input_ids"]
    too_long = [index + 1 for index, ids in enumerate(input_ids) if len(ids) > MAX_INPUT_TOKENS]
    if too_long:
        joined = ", ".join(str(index) for index in too_long)
        raise RuntimeError(
            f"Sentence(s) {joined} exceed the model's {MAX_INPUT_TOKENS}-token input limit. "
            "Shorten or split the English text and try again."
        )
    return prefixed, input_ids


def translate_sentences(sentences: list[str], engine: str) -> list[str]:
    if engine not in {"ctranslate2", "transformers"}:
        raise ValueError("engine must be ctranslate2 or transformers")
    tokenizer = _load_tokenizer()
    prefixed, input_ids = _prepare_sentences(sentences, tokenizer)

    if engine == "ctranslate2":
        return _translate_ctranslate2(input_ids, tokenizer)
    return _translate_transformers(prefixed, tokenizer)


def _translate_ctranslate2(input_ids: list[list[int]], tokenizer: Any) -> list[str]:
    import ctranslate2

    if not model_status()["ctranslate2_ready"]:
        raise RuntimeError("Install the translation engines and model before selecting CTranslate2.")
    translator = ctranslate2.Translator(
        str(CT2_MODEL_DIR), device="cpu", compute_type="int8"
    )
    tokenized = [tokenizer.convert_ids_to_tokens(ids) for ids in input_ids]
    results = translator.translate_batch(
        tokenized,
        beam_size=4,
        max_input_length=MAX_INPUT_TOKENS,
        max_decoding_length=MAX_OUTPUT_TOKENS,
    )
    outputs = []
    for result in results:
        token_ids = tokenizer.convert_tokens_to_ids(result.hypotheses[0])
        outputs.append(tokenizer.decode(token_ids, skip_special_tokens=True).strip())
    return outputs


def _translate_transformers(prefixed: list[str], tokenizer: Any) -> list[str]:
    import torch
    from transformers import AutoModelForSeq2SeqLM

    if not model_status()["source_downloaded"]:
        raise RuntimeError("Install the translation engines and model before selecting Transformers.")
    torch.set_num_threads(max(1, min(os.cpu_count() or 1, 8)))
    model = AutoModelForSeq2SeqLM.from_pretrained(
        SOURCE_MODEL_DIR, local_files_only=True
    ).to("cpu")
    inputs = tokenizer(
        prefixed,
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
