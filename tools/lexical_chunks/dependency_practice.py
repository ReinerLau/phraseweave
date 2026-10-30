"""Compose practice text from the dependency tree of the original sentence."""

from __future__ import annotations

from typing import Any, NamedTuple

from content_function_practice import CONTENT_POS, _word_bounds
from sentence_review import punctuation_practice_spans, utf16_spans

CLAUSE_PARTS = frozenset({
    "dobj", "obj", "iobj", "dative", "ccomp", "xcomp", "acomp", "attr",
    "oprd", "advmod", "npadvmod", "advcl", "prep", "agent",
})
NOUN_PARTS = frozenset({"relcl", "acl", "prep"})
PREPOSITION_PARTS = frozenset({"pobj", "pcomp"})
SUBJECTS = frozenset({"nsubj", "nsubjpass", "csubj", "csubjpass"})


class DependencyPractice(NamedTuple):
    steps: list[dict[str, Any]]
    preview_labels: list[str]


def _part_role(parent: Any, child: Any) -> str:
    """Name the child's role in its parent, without guessing semantic subtypes."""
    relation = child.dep_
    if relation in SUBJECTS:
        return "主语"
    if parent.pos_ == "ADP" and relation in PREPOSITION_PARTS:
        return "宾语"
    if relation in {"dobj", "obj"}:
        return "宾语"
    if relation in {"iobj", "dative"}:
        return "宾语"
    if relation in {"ccomp", "xcomp", "acomp", "attr", "oprd"}:
        return "补语"
    if parent.pos_ in {"NOUN", "PROPN", "PRON"} and relation in NOUN_PARTS:
        return "定语"
    if parent.pos_ == "ADJ" and relation == "prep":
        return "补语"
    if relation in {"advmod", "npadvmod", "advcl", "prep", "agent"}:
        return "状语"
    return "片段"


def build_dependency_practice(sentence: str, document: Any) -> DependencyPractice:
    """Build saved steps and transient preview labels from the same dependency walk."""
    bounds = _word_bounds(sentence)
    token_words: dict[int, int] = {}
    for token in document:
        if token.is_space or token.is_punct:
            continue
        for index, (start, end) in enumerate(bounds):
            if token.idx < end and token.idx + len(token.text) > start:
                token_words[token.i] = index
                break

    units: list[tuple[frozenset[int], bool, str]] = []
    seen: dict[frozenset[int], int] = {}

    def words_in(token: Any, available: set[int]) -> frozenset[int]:
        return frozenset(token_words[part.i] for part in token.subtree
                         if part.i in available and part.i in token_words)

    def emit(words: frozenset[int], leaf: bool = False, label: str = "片段",
             replace_label: bool = False) -> None:
        if not words:
            return
        index = seen.get(words)
        if index is None:
            seen[words] = len(units)
            units.append((words, leaf, label))
        elif replace_label:
            previous_words, previous_leaf, _ = units[index]
            units[index] = (previous_words, previous_leaf, label)

    def drill(token: Any, available: set[int], role: str = "") -> frozenset[int]:
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
            emit(whole, True, role or "片段")
            return whole

        # A spaCy clitic may share one editable word with its subject. Keep that word whole.
        subject_words = frozenset().union(*(words_in(child, available) for child in subjects))
        fused_subject = bool(subject_words & core)
        if fused_subject:
            subjects = []
            core = core | subject_words
        if subjects:
            for child in sorted(subjects, key=lambda item: item.idx):
                drill(child, available, "主语")
            emit(core, True, "谓语")
            current = core | subject_words
            emit(current, label="主谓")
        else:
            current = core
            if token.pos_ != "ADP" or not parts:
                core_label = "主谓" if fused_subject else (
                    "谓语" if token.pos_ in {"VERB", "AUX"} else role or "片段")
                emit(current, True, core_label)

        for child in sorted(parts, key=lambda item: item.idx):
            part_role = _part_role(token, child)
            child_words = drill(child, available, part_role)
            current = current | child_words
            if token.pos_ == "ADP":
                combination_label = role or "片段"
            elif part_role == "片段":
                combination_label = "片段"
            else:
                combination_label = f"接入{part_role}"
            emit(current, label=combination_label)
        if markers:
            current = current | frozenset().union(*(words_in(child, available) for child in markers))
            emit(current, label="接入连接词")
        whole_label = role or "片段"
        emit(whole, label=whole_label, replace_label=bool(role) and token.pos_ != "ADP")
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
    preview_labels: list[str] = []
    for word_set, leaf, label in units:
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
                preview_labels.append("实义词")
            functions = [index for index in range(len(local)) if index not in content]
            if content and functions:
                steps.append({"kind": "function-fill", "span": [runs[0][0], runs[0][1]],
                              "answer_word_indices": functions})
                preview_labels.append("功能词填空")
        steps.append(base)
        preview_labels.append(label)

    if steps and steps[-1]["kind"] == "segment" and steps[-1]["text"] == sentence:
        steps[-1] = {"kind": "sentence", "span": [0, len(sentence)]}
        preview_labels[-1] = "整句"
    else:
        steps.append({"kind": "sentence", "span": [0, len(sentence)]})
        preview_labels.append("整句")
    ranges = [tuple(step["span"]) for step in steps if "span" in step]
    contexts = [tuple(step["context_span"]) for step in steps if "context_span" in step]
    encoded = iter(utf16_spans(sentence, ranges))
    context_encoded = iter(utf16_spans(sentence, contexts))
    for step in steps:
        if "span" in step:
            step["span"] = list(next(encoded))
        if "context_span" in step:
            step["context_span"] = list(next(context_encoded))
    return DependencyPractice(steps, preview_labels)


def build_dependency_steps(sentence: str, document: Any) -> list[dict[str, Any]]:
    """Return ordered schema 10 steps, including reconstructed intermediate text."""
    return build_dependency_practice(sentence, document).steps


def preview_dependency_step(sentence: str, step: dict[str, Any], label: str = "片段") -> str:
    from content_function_practice import preview_step

    if "text" in step:
        return f"{label}：{step['text']}"
    return preview_step(sentence, step)
