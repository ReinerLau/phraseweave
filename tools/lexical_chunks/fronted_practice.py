"""Build syntax-backed practice spans from the complete sentence parse."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sentence_review import punctuation_practice_spans, utf16_spans

SUBJECT_DEPS = frozenset({"nsubj", "nsubjpass", "csubj", "csubjpass"})
NOMINAL_SUBJECT_DEPS = frozenset({"nsubj", "nsubjpass"})
FRONTED_ADJUNCT_DEPS = frozenset({"advmod", "npadvmod", "prep"})
LEADING_CONNECTOR_DEPS = frozenset({"cc", "discourse"})
MAIN_PREDICATE_DEPS = frozenset({"ROOT", "conj", "parataxis"})


@dataclass(frozen=True)
class _PracticeNode:
    span: tuple[int, int]
    children: tuple[_PracticeNode, ...] = ()


def _postorder(node: _PracticeNode) -> list[tuple[int, int]]:
    return [span for child in node.children for span in _postorder(child)] + [node.span]


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


def _subject_predicate_boundary(document: Any, core: tuple[int, int]) -> int | None:
    """Find a complete leading nominal subject and its following predicate."""
    start, end = core
    tokens = [token for token in document if start <= token.idx and token.idx + len(token.text) <= end]
    words = [token for token in tokens if not token.is_space and not token.is_punct]
    for subject in words:
        if subject.dep_ not in NOMINAL_SUBJECT_DEPS:
            continue
        predicate = subject.head
        if predicate not in tokens or predicate.pos_ not in {"VERB", "AUX"}:
            continue
        if predicate.dep_ not in MAIN_PREDICATE_DEPS and predicate.head in tokens:
            continue
        subject_start = subject.left_edge.idx
        subject_end = subject.right_edge.idx + len(subject.right_edge.text)
        if not start <= subject_start < subject_end < predicate.idx < end:
            continue
        if any(not token.is_space and not token.is_punct
               for token in tokens if token.idx < subject_start):
            continue
        subtree = {token.i for token in subject.subtree}
        if any(token.i not in subtree for token in words if token.idx < subject_end):
            continue
        return subject_end
    return None


def _practice_spans(sentence: str, document: Any, split_subject_predicate: bool) -> list[tuple[int, int]]:
    parent_steps = punctuation_practice_spans(sentence)
    parents = parent_steps[:-1] if len(parent_steps) > 1 else parent_steps
    parent_nodes: list[_PracticeNode] = []
    for parent in parents:
        fronted_boundary = _fronted_boundary(document, parent)
        core = parent
        fronted: tuple[int, int] | None = None
        if fronted_boundary is not None:
            start, end = parent
            left_end = fronted_boundary
            while left_end > start and sentence[left_end - 1].isspace():
                left_end -= 1
            fronted = (start, left_end)
            core = (fronted_boundary, end)

        subject_end = _subject_predicate_boundary(document, core) if split_subject_predicate else None
        core_node = _PracticeNode(core)
        if subject_end is not None:
            predicate_start = subject_end
            while predicate_start < core[1] and sentence[predicate_start].isspace():
                predicate_start += 1
            core_node = _PracticeNode(core, (
                _PracticeNode((core[0], subject_end)),
                _PracticeNode((predicate_start, core[1])),
            ))
        parent_nodes.append(
            _PracticeNode(parent, (core_node, _PracticeNode(fronted)))
            if fronted is not None else core_node
        )

    whole = (0, len(sentence))
    root = _PracticeNode(whole, tuple(parent_nodes)) if len(parent_nodes) > 1 else parent_nodes[0]
    return utf16_spans(sentence, _postorder(root))


def fronted_adjunct_practice_spans(sentence: str, nlp: Any) -> list[tuple[int, int]]:
    """Return UTF-16 leaves, their punctuation parents, then the whole sentence."""
    return _practice_spans(sentence, nlp(sentence), split_subject_predicate=False)


def syntactic_practice_spans(sentence: str, document: Any) -> list[tuple[int, int]]:
    """Return fronted adjunct, subject, predicate, and enclosing spans in practice order."""
    return _practice_spans(sentence, document, split_subject_predicate=True)
