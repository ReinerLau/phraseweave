"""Build content-word and function-word questions inside saved practice segments."""

from __future__ import annotations

import unicodedata
from collections.abc import Sequence
from typing import Any

from sentence_review import utf16_spans

CONTENT_POS = frozenset({"NOUN", "PROPN", "VERB", "ADJ", "ADV", "NUM"})


def _word_character(character: str) -> bool:
    return unicodedata.category(character)[:1] in {"L", "N", "M"}


def _word_bounds(text: str) -> list[tuple[int, int]]:
    """Mirror the client's editable word runs, including internal apostrophes."""
    bounds: list[tuple[int, int]] = []
    start: int | None = None
    for index, character in enumerate(text):
        internal_apostrophe = (
            character in "'‘’"
            and index > 0 and index + 1 < len(text)
            and _word_character(text[index - 1]) and _word_character(text[index + 1])
        )
        boundary = character.isspace() or (
            unicodedata.category(character).startswith("P") and not internal_apostrophe
        )
        if boundary:
            if start is not None:
                bounds.append((start, index))
                start = None
        elif start is None:
            start = index
    if start is not None:
        bounds.append((start, len(text)))
    return bounds


def build_practice_steps(
    sentence: str, segment_spans: Sequence[tuple[int, int]], nlp: Any
) -> list[dict[str, Any]]:
    """Return UTF-16 ranges in first-pass order; the whole sentence is last."""
    document = nlp(sentence)
    whole = (0, len(sentence))
    offsets = [0]
    for character in sentence:
        offsets.append(offsets[-1] + (2 if ord(character) > 0xFFFF else 1))
    codepoint_at_utf16 = {offset: index for index, offset in enumerate(offsets)}
    segments = [
        (codepoint_at_utf16[start], codepoint_at_utf16[end])
        for start, end in (segment_spans[:-1] if len(segment_spans) > 1 else [segment_spans[-1]])
    ]
    steps: list[dict[str, Any]] = []

    for start, end in segments:
        # Clause mode emits children before their enclosing parent. Drill only leaves.
        if any(start <= left and right <= end and (left, right) != (start, end)
               for left, right in segments):
            steps.append({"kind": "segment", "span": [start, end]})
            continue
        local_words = _word_bounds(sentence[start:end])
        content: list[int] = []
        for index, (left, right) in enumerate(local_words):
            absolute_left, absolute_right = start + left, start + right
            if any(token.pos_ in CONTENT_POS and not token.is_punct and not token.is_space
                   and token.idx < absolute_right and token.idx + len(token.text) > absolute_left
                   for token in document):
                content.append(index)
        if not content:
            steps.append({"kind": "segment", "span": [start, end]})
            continue
        for index in content:
            left, right = local_words[index]
            steps.append({
                "kind": "content-word", "span": [start + left, start + right],
                "context_span": [start, end],
            })
        functions = [index for index in range(len(local_words)) if index not in content]
        if functions:
            steps.append({
                "kind": "function-fill", "span": [start, end],
                "answer_word_indices": functions,
            })

    if not steps or steps[-1]["span"] != list(whole) or steps[-1]["kind"] != "segment":
        steps.append({"kind": "sentence", "span": [0, len(sentence)]})
    else:
        steps[-1]["kind"] = "sentence"

    ranges = [tuple(step["span"]) for step in steps]
    contexts = [tuple(step["context_span"]) for step in steps if "context_span" in step]
    utf16_ranges = iter(utf16_spans(sentence, ranges))
    utf16_contexts = iter(utf16_spans(sentence, contexts))
    for step in steps:
        step["span"] = list(next(utf16_ranges))
        if "context_span" in step:
            step["context_span"] = list(next(utf16_contexts))
    return steps


def preview_step(sentence: str, step: dict[str, Any]) -> str:
    start, end = step["span"]
    text = sentence.encode("utf-16-le")[start * 2:end * 2].decode("utf-16-le")
    if step["kind"] == "content-word":
        return f"实义词：{text}"
    if step["kind"] == "function-fill":
        bounds = _word_bounds(text)
        result = text
        for index in reversed(step["answer_word_indices"]):
            left, right = bounds[index]
            result = result[:left] + "___" + result[right:]
        return f"功能词填空：{result}"
    return f"{'整句' if step['kind'] == 'sentence' else '组合片段'}：{text}"
