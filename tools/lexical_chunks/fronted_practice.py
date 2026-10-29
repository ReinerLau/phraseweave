"""Split detachable fronted adjuncts from punctuation practice segments."""

from __future__ import annotations

from typing import Any

from sentence_review import punctuation_practice_spans, utf16_spans

SUBJECT_DEPS = frozenset({"nsubj", "nsubjpass", "csubj", "csubjpass"})
FRONTED_ADJUNCT_DEPS = frozenset({"advmod", "npadvmod", "prep", "advcl"})
LEADING_CONNECTOR_DEPS = frozenset({"cc", "discourse"})
MAIN_PREDICATE_DEPS = frozenset({"ROOT", "conj", "parataxis"})


def _fronted_boundary(document: Any, parent: tuple[int, int]) -> int | None:
    """Find a subject boundary only when the whole prefix is detachable."""
    start, end = parent
    tokens = [token for token in document if start <= token.idx and token.idx + len(token.text) <= end]
    for subject in tokens:
        if subject.dep_ not in SUBJECT_DEPS:
            continue
        predicate = subject.head
        if predicate not in tokens or predicate.pos_ not in {"VERB", "AUX"}:
            continue
        if predicate.dep_ not in MAIN_PREDICATE_DEPS and predicate.head in tokens:
            continue
        boundary = subject.left_edge.idx
        if not start < boundary < predicate.idx < end:
            continue
        if subject.right_edge.idx + len(subject.right_edge.text) > end:
            continue

        prefix = [token for token in tokens if token.idx < boundary and not token.is_space and not token.is_punct]
        if not prefix:
            continue
        covered: set[int] = set()
        for child in predicate.children:
            if child.dep_ not in FRONTED_ADJUNCT_DEPS:
                continue
            subtree = list(child.subtree)
            if subtree and all(start <= part.idx and part.idx + len(part.text) <= boundary for part in subtree):
                covered.update(part.i for part in subtree)
        if not covered.intersection(token.i for token in prefix):
            continue
        if all(token.i in covered or token.dep_ in LEADING_CONNECTOR_DEPS for token in prefix):
            return boundary
    return None


def fronted_adjunct_practice_spans(sentence: str, nlp: Any) -> list[tuple[int, int]]:
    """Return UTF-16 leaves, their punctuation parents, then the whole sentence."""
    parent_steps = punctuation_practice_spans(sentence)
    parents = parent_steps[:-1] if len(parent_steps) > 1 else parent_steps
    document = nlp(sentence)
    steps: list[tuple[int, int]] = []
    for parent in parents:
        boundary = _fronted_boundary(document, parent)
        if boundary is None:
            steps.append(parent)
            continue
        start, end = parent
        left_end = boundary
        while left_end > start and sentence[left_end - 1].isspace():
            left_end -= 1
        steps.extend([(start, left_end), (boundary, end), parent])

    whole = (0, len(sentence))
    if not steps or steps[-1] != whole:
        steps.append(whole)
    return utf16_spans(sentence, steps)
