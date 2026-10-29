"""Dependency-backed work delegated by the standard-library local service."""

from __future__ import annotations

import json
import sys
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from content_function_practice import build_practice_steps, preview_step
from fronted_practice import fronted_adjunct_practice_spans
from model_runtime import TRANSLATION_PROVIDERS, install_model, model_status, translate_contextual_word, translate_sentences
from sentence_review import (
    render_lazy_markdown, split_sentences,
)
from split_lexical_chunks import load_syntax_model


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
    stem = "text.sentence-review"
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
    if payload.get("splitClauses", False) is not False:
        raise ValueError("Clause splitting is temporarily unavailable.")
    sentences = split_sentences(text)
    nlp = load_syntax_model()
    segment_spans = [
        fronted_adjunct_practice_spans(sentence, nlp)
        for sentence in sentences
    ]
    practice_steps = [
        build_practice_steps(sentence, spans, nlp)
        for sentence, spans in zip(sentences, segment_spans, strict=True)
    ]
    markdown = (
        render_lazy_markdown(sentences)
        if output_format in {"markdown", "both"}
        else ""
    )
    phraseweave = ""
    if output_format in {"phraseweave", "both"}:
        phraseweave = json.dumps({
            "schema_version": 8,
            "practice_sequence": "lazy-content-function-v1",
            "statements": [{
                "english": sentence,
                "context_before": "",
                "context_after": "",
                "unit_id": f"{index}:whole",
                "source_unit_ids": [],
                "practice_steps": steps,
            } for index, (sentence, steps) in enumerate(zip(sentences, practice_steps, strict=True))],
        }, ensure_ascii=False, indent=2) + "\n"
    outputs = _build_outputs(markdown, phraseweave, output_format)

    result = {
        "ok": True,
        "outputs": outputs,
        "model": model_status(),
    }
    result["preview"] = [{
        "sentence": sentence,
        "steps": [preview_step(sentence, step) for step in steps],
    } for sentence, steps in zip(sentences, practice_steps, strict=True)]
    _emit(result)


def _translate(payload: Mapping[str, Any]) -> None:
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 30_000:
        raise ValueError("Choose one nonempty practice step under 30,000 characters.")
    provider = payload.get("translationProvider", "index-translate")
    if provider not in TRANSLATION_PROVIDERS:
        raise ValueError("Choose a supported translation provider.")
    context = payload.get("context")
    if context is not None and (not isinstance(context, str) or not context.strip() or len(context) > 30_000):
        raise ValueError("Choose a nonempty context under 30,000 characters.")
    translated = (
        [translate_contextual_word(text, context, provider)]
        if context else translate_sentences([text], provider)
    )
    if len(translated) != 1 or not translated[0].strip():
        raise RuntimeError("The translation engine did not return a prompt.")
    _emit({"ok": True, "chinese": translated[0].strip()})


def main() -> int:
    try:
        payload = _read_request()
        action = payload.get("action")
        if action == "install-model":
            install_model(lambda message: _emit({"progress": message}))
            _emit({"ok": True, "model": model_status()})
        elif action == "generate":
            _generate(payload)
        elif action == "translate":
            _translate(payload)
        elif action == "status":
            _emit({"ok": True, "model": model_status()})
        else:
            raise ValueError("Unsupported worker action.")
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        _emit({"ok": False, "error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
