"""Dependency-backed work delegated by the standard-library local service."""

from __future__ import annotations

import json
import sys
from collections.abc import Mapping
from typing import Any

from model_runtime import TRANSLATION_PROVIDERS, install_model, model_status, translate_contextual_word, translate_sentences


def _read_request() -> Mapping[str, Any]:
    payload = json.loads(sys.stdin.read())
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    return payload


def _emit(value: Mapping[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False), flush=True)


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
