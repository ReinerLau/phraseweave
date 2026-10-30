"""Compose practice text from the dependency tree of the original sentence."""

from __future__ import annotations

from typing import Any

from content_function_practice import CONTENT_POS, _word_bounds
from sentence_review import punctuation_practice_spans, utf16_spans

CLAUSE_PARTS = frozenset({
    "dobj", "obj", "iobj", "dative", "ccomp", "xcomp", "acomp", "attr",
    "oprd", "advmod", "npadvmod", "advcl", "prep", "agent",
})
NOUN_PARTS = frozenset({"relcl", "acl", "prep"})
PREPOSITION_PARTS = frozenset({"pobj", "pcomp"})
SUBJECTS = frozenset({"nsubj", "nsubjpass", "csubj", "csubjpass"})


def build_dependency_steps(sentence: str, document: Any) -> list[dict[str, Any]]:
    """Return ordered schema 10 steps, including reconstructed intermediate text."""
    bounds = _word_bounds(sentence)
    token_words: dict[int, int] = {}
    for token in document:
        if token.is_space or token.is_punct:
            continue
        for index, (start, end) in enumerate(bounds):
            if token.idx < end and token.idx + len(token.text) > start:
                token_words[token.i] = index
                break

    units: list[tuple[frozenset[int], bool]] = []
    seen: set[frozenset[int]] = set()

    def words_in(token: Any, available: set[int]) -> frozenset[int]:
        return frozenset(token_words[part.i] for part in token.subtree
                         if part.i in available and part.i in token_words)

    def emit(words: frozenset[int], leaf: bool = False) -> None:
        if words and words not in seen:
            seen.add(words)
            units.append((words, leaf))

    def drill(token: Any, available: set[int]) -> frozenset[int]:
        whole = words_in(token, available)
        if not whole:
            return whole
        children = [child for child in token.children if child.i in available]
        def detachable(child: Any) -> bool:
            return child.dep_ != "prep" or any(
                part.dep_ in PREPOSITION_PARTS for part in child.children)

        if token.pos_ in {"VERB", "AUX"}:
            subjects = [child for child in children if child.dep_ in SUBJECTS]
            parts = [child for child in children if child.dep_ in CLAUSE_PARTS and detachable(child)]
            markers = [child for child in children if child.dep_ == "mark" and
                       subjects and child.idx < subjects[0].idx]
            if subjects and any(child.dep_ in {"aux", "auxpass"} and
                                child.idx < subjects[0].idx < token.idx for child in children):
                subjects = []
        elif token.pos_ == "ADP":
            subjects = []
            parts = [child for child in children if child.dep_ in PREPOSITION_PARTS]
            markers = []
        elif token.pos_ in {"NOUN", "PROPN", "PRON"}:
            subjects = []
            parts = [child for child in children if child.dep_ in NOUN_PARTS and detachable(child)]
            markers = []
        elif token.pos_ == "ADJ":
            subjects = []
            parts = [child for child in children if child.dep_ in {"prep", "advmod"}
                     and detachable(child)]
            markers = []
        else:
            subjects = []
            parts = []
            markers = []

        def contained(child: Any) -> bool:
            return all(part.i in available for part in child.subtree if not part.is_punct)

        subjects = [child for child in subjects if contained(child)]
        parts = [child for child in parts if contained(child)]
        markers = [child for child in markers if contained(child)]
        detached = {part.i for child in (*subjects, *parts, *markers) for part in child.subtree}
        core = frozenset(token_words[part.i] for part in token.subtree
                         if part.i in available and part.i not in detached and part.i in token_words)
        if not core:
            emit(whole, True)
            return whole

        # A spaCy clitic may share one editable word with its subject. Keep that word whole.
        subject_words = frozenset().union(*(words_in(child, available) for child in subjects))
        if subject_words & core:
            subjects = []
            core = core | subject_words
        if subjects:
            for child in sorted(subjects, key=lambda item: item.idx):
                drill(child, available)
            emit(core, True)
            current = core | subject_words
            emit(current)
        else:
            current = core
            if token.pos_ != "ADP" or not parts:
                emit(current, True)

        for child in sorted(parts, key=lambda item: item.idx):
            child_words = drill(child, available)
            current = current | child_words
            emit(current)
        if markers:
            current = current | frozenset().union(*(words_in(child, available) for child in markers))
            emit(current)
        emit(whole)
        return whole

    parent_ranges = punctuation_practice_spans(sentence)
    parents = parent_ranges[:-1] if len(parent_ranges) > 1 else parent_ranges
    for start, end in parents:
        available = {token.i for token in document
                     if start <= token.idx and token.idx + len(token.text) <= end
                     and token.i in token_words}
        if not available:
            continue
        roots = [token for token in document if token.i in available
                 and (token.head.i not in available or token.head.i == token.i)]
        all_words = frozenset(token_words[index] for index in available)
        predicate_roots = [token for token in roots if token.pos_ in {"VERB", "AUX"}]
        root = roots[0] if len(roots) == 1 else (
            predicate_roots[0] if len(predicate_roots) == 1 and all(
                token == predicate_roots[0] or token.dep_ in {"cc", "discourse"}
                for token in roots) else None)
        if root is not None and (words_in(root, available) == all_words or
                                 all(token == root or token.dep_ in {"cc", "discourse"}
                                     for token in roots)):
            drill(root, available)
            emit(all_words)
        else:
            emit(all_words, True)

    if len(parents) == 1 and len(units) > 1 and units[-1][0] == frozenset(token_words.values()):
        units.pop()

    steps: list[dict[str, Any]] = []
    for word_set, leaf in units:
        ordered = sorted(word_set)
        runs: list[tuple[int, int]] = []
        first = last = ordered[0]
        for index in ordered[1:]:
            if index == last + 1:
                last = index
            else:
                runs.append((bounds[first][0], bounds[last][1]))
                first = last = index
        runs.append((bounds[first][0], bounds[last][1]))
        text = " ".join(sentence[start:end] for start, end in runs)
        if not any(character.isalnum() for character in text):
            continue
        base: dict[str, Any] = {"kind": "segment", "text": text}
        if leaf and len(runs) == 1:
            local = _word_bounds(text)
            content = [index for index, (left, right) in enumerate(local)
                       if any(token.pos_ in CONTENT_POS and not token.is_space and not token.is_punct
                              and token.idx < runs[0][0] + right
                              and token.idx + len(token.text) > runs[0][0] + left
                              for token in document)]
            for index in content:
                left, right = local[index]
                steps.append({"kind": "content-word",
                              "span": [runs[0][0] + left, runs[0][0] + right],
                              "context_span": [runs[0][0], runs[0][1]]})
            functions = [index for index in range(len(local)) if index not in content]
            if content and functions:
                steps.append({"kind": "function-fill", "span": [runs[0][0], runs[0][1]],
                              "answer_word_indices": functions})
        steps.append(base)

    if steps and steps[-1]["kind"] == "segment" and steps[-1]["text"] == sentence:
        steps[-1] = {"kind": "sentence", "span": [0, len(sentence)]}
    else:
        steps.append({"kind": "sentence", "span": [0, len(sentence)]})
    ranges = [tuple(step["span"]) for step in steps if "span" in step]
    contexts = [tuple(step["context_span"]) for step in steps if "context_span" in step]
    encoded = iter(utf16_spans(sentence, ranges))
    context_encoded = iter(utf16_spans(sentence, contexts))
    for step in steps:
        if "span" in step:
            step["span"] = list(next(encoded))
        if "context_span" in step:
            step["context_span"] = list(next(context_encoded))
    return steps


def preview_dependency_step(sentence: str, step: dict[str, Any]) -> str:
    from content_function_practice import preview_step

    if "text" in step:
        return f"组合片段：{step['text']}"
    return preview_step(sentence, step)
