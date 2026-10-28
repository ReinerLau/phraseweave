"""Build a stable, surface-order practice sequence from spaCy clause subtrees."""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

from sentence_review import practice_spans, punctuation_practice_spans, utf16_spans

CLAUSE_DEPS = frozenset({"advcl", "ccomp", "xcomp", "acl", "relcl", "csubj", "csubjpass", "pcomp"})


def _words(text: str) -> bool:
    return any(character.isalnum() for character in text)


def _clause_bounds(token: Any) -> tuple[int, int]:
    subtree = list(token.subtree)
    return min(part.idx for part in subtree), max(part.idx + len(part.text) for part in subtree)


def _split_parent(
    sentence: str,
    parent: tuple[int, int],
    candidates: Sequence[tuple[int, int]],
) -> list[tuple[int, int]]:
    start, end = parent
    selected: list[tuple[int, int]] = []
    for candidate in sorted(set(candidates), key=lambda item: (item[0], -item[1])):
        left, right = candidate
        if left < start or right > end or (left, right) == parent:
            continue
        if not _words(sentence[start:left] + sentence[right:end]):
            continue
        if any(a < left < b < right or left < a < right < b for a, b in selected):
            return [parent]
        selected.append(candidate)

    if not selected:
        return [parent]

    steps: list[tuple[int, int]] = []

    def emit(bounds: tuple[int, int]) -> None:
        left, right = bounds
        children = [item for item in selected if item != bounds and left <= item[0] and item[1] <= right]
        direct = [item for item in children if not any(
            item != other and other[0] <= item[0] and item[1] <= other[1]
            for other in children
        )]
        direct.sort()
        cursor = left
        for child in direct:
            if _words(sentence[cursor:child[0]]):
                steps.append((cursor, child[0]))
            emit(child)
            cursor = child[1]
        if _words(sentence[cursor:right]):
            steps.append((cursor, right))
        if direct:
            steps.append(bounds)
        elif _words(sentence[left:right]):
            steps.append(bounds)

    emit(parent)
    if len(steps) <= 1:
        return [parent]
    # Punctuation-only gaps do not become questions; the parent still contains them.
    normalized: list[tuple[int, int]] = []
    for left, right in steps:
        while left < right and sentence[left].isspace():
            left += 1
        while right > left and sentence[right - 1].isspace():
            right -= 1
        if left < right and (left, right) not in normalized:
            normalized.append((left, right))
    return normalized


def clause_practice_spans(sentence: str, nlp: Any) -> list[tuple[int, int]]:
    """Return UTF-16 ranges ordered as small parts, comma parents, then whole."""
    return _clause_practice_spans(sentence, nlp, practice_spans(sentence))


def punctuation_clause_practice_spans(sentence: str, nlp: Any) -> list[tuple[int, int]]:
    """Split clauses within the new punctuation-delimited parent steps."""
    return _clause_practice_spans(sentence, nlp, punctuation_practice_spans(sentence))


def _clause_practice_spans(
    sentence: str, nlp: Any, parent_steps: Sequence[tuple[int, int]]
) -> list[tuple[int, int]]:
    document = nlp(sentence)
    parents = parent_steps[:-1] if len(parent_steps) > 1 else parent_steps
    candidates = [
        _clause_bounds(token)
        for token in document
        if token.dep_ in CLAUSE_DEPS and token.pos_ in {"VERB", "AUX"}
    ]
    steps: list[tuple[int, int]] = []
    for parent in parents:
        steps.extend(_split_parent(sentence, parent, candidates))
    whole = (0, len(sentence))
    if not steps or steps[-1] != whole:
        steps.append(whole)
    return utf16_spans(sentence, steps)


def render_clause_phraseweave(sentences: Sequence[str], spans: Sequence[Sequence[tuple[int, int]]]) -> str:
    return json.dumps({
        "schema_version": 6,
        "practice_sequence": "lazy-clause-segments-v1",
        "statements": [{
            "english": sentence,
            "context_before": "",
            "context_after": "",
            "unit_id": f"{index}:whole",
            "source_unit_ids": [],
            "practice_spans": [list(span) for span in sentence_spans],
        } for index, (sentence, sentence_spans) in enumerate(zip(sentences, spans, strict=True))],
    }, ensure_ascii=False, indent=2) + "\n"
