"""Dependency-backed work delegated by the standard-library local service."""

from __future__ import annotations

import json
import sys
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from model_runtime import install_model, model_status, translate_sentences
from split_lexical_chunks import (
    ConfigurationError,
    generate_plan,
    load_syntax_model,
    render_markdown,
    render_phraseweave,
)


def _read_request() -> Mapping[str, Any]:
    payload = json.loads(sys.stdin.read())
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    return payload


def _emit(value: Mapping[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False), flush=True)


def _build_outputs(
    markdown: str,
    phraseweave: str,
    output_format: str,
    created_at: datetime | None = None,
) -> list[dict[str, str]]:
    timestamp = (created_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    suffix = timestamp.strftime("%Y%m%dT%H%M%S%fZ")
    stem = "text.review.learning-units"
    outputs = []
    if output_format in {"markdown", "both"}:
        outputs.append({"name": f"{stem}-{suffix}.md", "content": markdown})
    if output_format in {"phraseweave", "both"}:
        outputs.append({"name": f"{stem}-{suffix}.json", "content": phraseweave})
    return outputs


def _generate(payload: Mapping[str, Any]) -> None:
    text = payload.get("text")
    output_format = payload.get("format")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Enter English text before generating.")
    if len(text) > 30000:
        raise ValueError("Input is too long. Keep it under 30,000 characters.")
    if output_format not in {"markdown", "phraseweave", "both"}:
        raise ValueError("Choose an output format.")

    nlp = load_syntax_model()
    plan, traces = generate_plan(text, nlp)
    sentences = [item["sentence"] for item in plan["sentences"]]
    chinese = translate_sentences(sentences)
    if len(chinese) != len(sentences) or any(not line for line in chinese):
        raise RuntimeError("The translation engine did not return one prompt for each sentence.")
    translations = {
        "sentences": [
            {"sentence_chinese": line} for line in chinese
        ]
    }

    markdown = (
        render_markdown(plan, translations, traces)
        if output_format in {"markdown", "both"}
        else ""
    )
    phraseweave = (
        render_phraseweave(plan, translations, traces)
        if output_format in {"phraseweave", "both"}
        else ""
    )
    outputs = _build_outputs(markdown, phraseweave, output_format)

    _emit({
        "ok": True,
        "outputs": outputs,
        "model": model_status(),
    })


def main() -> int:
    try:
        payload = _read_request()
        action = payload.get("action")
        if action == "install-model":
            install_model(lambda message: _emit({"progress": message}))
            _emit({"ok": True, "model": model_status()})
        elif action == "generate":
            _generate(payload)
        elif action == "status":
            _emit({"ok": True, "model": model_status()})
        else:
            raise ValueError("Unsupported worker action.")
        return 0
    except (ConfigurationError, OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        _emit({"ok": False, "error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
