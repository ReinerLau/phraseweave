"""Generate learning units by closing adjacent dependency subtrees."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from importlib.metadata import PackageNotFoundError, version
from typing import Any

SPACY_VERSION = "3.8.7"
MODEL_DISTRIBUTION = "en-core-web-sm"
MODEL_VERSION = "3.8.0"
PLAN_SCHEMA_VERSION = 3
ALGORITHM_VERSION = 7
PHRASEWEAVE_SCHEMA_VERSION = 4
DOUBLE_QUOTES = frozenset({'"', "“", "”"})


class ConfigurationError(RuntimeError):
    """Raised when plans, annotations, or fixed dependencies are incompatible."""


def load_syntax_model() -> Any:
    try:
        installed_spacy = version("spacy")
        installed_model = version(MODEL_DISTRIBUTION)
    except PackageNotFoundError as error:
        raise ConfigurationError(f"required spaCy dependency is missing: {error.name}") from error
    if installed_spacy != SPACY_VERSION:
        raise ConfigurationError(f"spaCy {SPACY_VERSION} is required; found {installed_spacy}")
    if installed_model != MODEL_VERSION:
        raise ConfigurationError(
            f"{MODEL_DISTRIBUTION} {MODEL_VERSION} is required; found {installed_model}"
        )
    try:
        import en_core_web_sm

        return en_core_web_sm.load()
    except Exception as error:
        raise ConfigurationError(f"cannot load fixed spaCy model: {error}") from error


def _exact_keys(value: Any, keys: set[str], location: str) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise ConfigurationError(f"{location} must contain exactly: {', '.join(sorted(keys))}")


def _syntax_text(text: str) -> tuple[str, list[int]]:
    """Ignore double quotes for parsing while retaining original character offsets."""
    clean: list[str] = []
    offsets: list[int] = []
    for index, char in enumerate(text):
        if char not in DOUBLE_QUOTES:
            clean.append(char)
            offsets.append(index)
            continue
        next_index = index + 1
        while next_index < len(text) and text[next_index] in DOUBLE_QUOTES:
            next_index += 1
        if (
            clean
            and clean[-1].isalnum()
            and next_index < len(text)
            and text[next_index].isalnum()
        ):
            clean.append(" ")
            offsets.append(index)
    clean_text = "".join(clean)
    start = len(clean_text) - len(clean_text.lstrip())
    clean_text = clean_text.strip()
    return clean_text, offsets[start:start + len(clean_text)]


def _build_sentence(
    sentence_span: Any,
    sentence: str,
    sentence_start: int,
    offsets: Sequence[int],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    tokens = [token for token in sentence_span if not token.is_space and not token.is_punct]
    if not tokens:
        raise ConfigurationError(f"sentence has no word tokens: {sentence!r}")
    token_by_id = {token.i: token for token in tokens}
    token_position = {token.i: position for position, token in enumerate(tokens)}
    units: list[dict[str, Any]] = []
    explanations: list[str] = []
    sources: list[tuple[tuple[int, int], ...] | None] = []
    seen_spans: set[tuple[int, int]] = set()
    blocked: list[dict[str, str]] = []
    completed: dict[int, tuple[int, int] | None] = {}

    def phrase_text(bounds: tuple[int, int]) -> str:
        start, end = source_span(bounds)
        return sentence[start:end]

    def source_span(bounds: tuple[int, int]) -> tuple[int, int]:
        first, last = (sentence_span.doc[index] for index in bounds)
        return (
            offsets[first.idx] - sentence_start,
            offsets[last.idx + len(last.text) - 1] + 1 - sentence_start,
        )

    def record(
        bounds: tuple[int, int],
        kind: str,
        explanation: str,
        operands: tuple[tuple[int, int], tuple[int, int]] | None = None,
    ) -> None:
        start, end = source_span(bounds)
        if (start, end) in seen_spans:
            return
        seen_spans.add((start, end))
        units.append({
            "text": sentence[start:end],
            "span": {"start": start, "end": end},
            "kind": kind,
        })
        explanations.append(explanation)
        if operands is not None:
            sources.append(tuple(source_span(operand) for operand in operands))
        else:
            sources.append(None)

    def adjacent(left: tuple[int, int], right: tuple[int, int]) -> bool:
        # Count only word tokens for adjacency; bounds still refer to the original text.
        return token_position[left[1]] + 1 == token_position[right[0]]

    def visit(token: Any) -> None:
        if token.i in completed:
            return
        children = sorted(
            (child for child in token.children if child.i in token_by_id),
            key=lambda child: (
                not any(grandchild.i in token_by_id for grandchild in child.children),
                child.i,
            ),
        )
        for child in children:
            visit(child)

        current = (token.i, token.i)
        record(current, "word", "词元")
        remaining = {
            child.i: completed[child.i]
            for child in children
            if completed[child.i] is not None
        }
        while remaining:
            left = next(
                ((index, bounds) for index, bounds in remaining.items() if adjacent(bounds, current)),
                None,
            )
            right = next(
                ((index, bounds) for index, bounds in remaining.items() if adjacent(current, bounds)),
                None,
            )
            if left is None and right is None:
                break
            if left is not None:
                left_index, left_bounds = left
                left_text = phrase_text(left_bounds)
                record(
                    (left_bounds[0], current[1]),
                    "phrase",
                    f"中心词 {token.text}；左接 {left_text}",
                    (left_bounds, current),
                )
                del remaining[left_index]
            if right is not None:
                right_index, right_bounds = right
                right_text = phrase_text(right_bounds)
                record(
                    (current[0], right_bounds[1]),
                    "phrase",
                    f"中心词 {token.text}；右接 {right_text}",
                    (current, right_bounds),
                )
                del remaining[right_index]
            if left is not None and right is not None:
                record(
                    (left_bounds[0], right_bounds[1]),
                    "phrase",
                    f"中心词 {token.text}；左接 {left_text}；右接 {right_text}",
                    ((left_bounds[0], current[1]), (current[0], right_bounds[1])),
                )
            current = (
                left_bounds[0] if left is not None else current[0],
                right_bounds[1] if right is not None else current[1],
            )

        for child in children:
            if child.i in remaining or completed[child.i] is None:
                reason = "子短语未闭合" if completed[child.i] is None else "与当前片段不相邻"
                blocked.append({"head": token.text, "child": child.text, "reason": reason})
        completed[token.i] = (
            current
            if all(completed[child.i] is not None for child in children) and not remaining
            else None
        )

    for token in tokens:
        if token.head.i == token.i or token.head.i not in token_by_id:
            visit(token)
    for token in tokens:
        visit(token)

    full_bounds = (tokens[0].i, tokens[-1].i)
    full_start, full_end = source_span(full_bounds)
    sentence_sources = None
    for index in range(len(units) - 1, -1, -1):
        if units[index]["span"] == {"start": full_start, "end": full_end}:
            sentence_sources = sources.pop(index)
            del units[index]
            del explanations[index]
            seen_spans.remove((full_start, full_end))
            break
    units.append({
        "text": sentence,
        "span": {"start": 0, "end": len(sentence)},
        "kind": "sentence",
    })
    explanations.append("整句")
    sources.append(sentence_sources)

    trace = {
        "tree_tokens": [
            {
                "index": token.i,
                "text": token.text,
                "pos": token.pos_,
                "dep": token.dep_,
                "head_index": token.head.i,
            }
            for token in sentence_span
            if not token.is_space
        ],
        "explanations": explanations,
        "sources": sources,
        "blocked": blocked,
    }
    return units, trace


def generate_plan(text: str, nlp: Any) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    original = text.strip()
    clean_text, offsets = _syntax_text(original)
    if not clean_text:
        raise ConfigurationError("No English text was provided on stdin.")
    opening_quotes: set[int] = set()
    closing_quotes: set[int] = set()
    inside_straight_quotes = False
    for index, char in enumerate(original):
        if char == '"':
            # A saved sentence may contain the closing quote of a multi-sentence quote.
            closes_quote = inside_straight_quotes or index == len(original) - 1
            (closing_quotes if closes_quote else opening_quotes).add(index)
            inside_straight_quotes = not inside_straight_quotes
        elif char == "“":
            opening_quotes.add(index)
        elif char == "”":
            closing_quotes.add(index)
    document = nlp(clean_text)
    sentences: list[dict[str, Any]] = []
    traces: list[dict[str, Any]] = []
    for sentence_span in document.sents:
        parsed = sentence_span.text.strip()
        if parsed:
            clean_start = sentence_span.start_char + (
                len(sentence_span.text) - len(sentence_span.text.lstrip())
            )
            clean_end = clean_start + len(parsed)
            source_start = offsets[clean_start]
            source_end = offsets[clean_end - 1] + 1
            # Quotes removed at either boundary still belong to the original sentence.
            while source_start > 0 and (
                source_start - 1 in opening_quotes or original[source_start - 1].isspace()
            ):
                source_start -= 1
            while source_end < len(original) and (
                source_end in closing_quotes or original[source_end].isspace()
            ):
                source_end += 1
            raw_sentence = original[source_start:source_end]
            source_start += len(raw_sentence) - len(raw_sentence.lstrip())
            sentence = raw_sentence.strip()
            units, trace = _build_sentence(sentence_span, sentence, source_start, offsets)
            sentences.append({"sentence": sentence, "units": units})
            traces.append({"sentence": sentence, "units": units, **trace})
    if not sentences:
        raise ConfigurationError("spaCy did not find any sentences in the input.")
    return {
        "schema_version": PLAN_SCHEMA_VERSION,
        "algorithm_version": ALGORITHM_VERSION,
        "spacy_version": SPACY_VERSION,
        "model_version": MODEL_VERSION,
        "sentences": sentences,
    }, traces


def _validate_plan(payload: Any, nlp: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("schema_version") != PLAN_SCHEMA_VERSION:
        raise ConfigurationError(f"plan must use schema_version {PLAN_SCHEMA_VERSION}")
    _exact_keys(
        payload,
        {"schema_version", "algorithm_version", "spacy_version", "model_version", "sentences"},
        "plan",
    )
    if (
        payload["algorithm_version"] != ALGORITHM_VERSION
        or payload["spacy_version"] != SPACY_VERSION
        or payload["model_version"] != MODEL_VERSION
    ):
        raise ConfigurationError("plan generator versions do not match the current generator")
    if not isinstance(payload["sentences"], list) or not payload["sentences"]:
        raise ConfigurationError("plan.sentences must be a non-empty list")
    checked: list[dict[str, Any]] = []
    for index, raw_sentence in enumerate(payload["sentences"]):
        location = f"plan.sentences[{index}]"
        _exact_keys(raw_sentence, {"sentence", "units"}, location)
        if not isinstance(raw_sentence["sentence"], str) or not raw_sentence["sentence"].strip():
            raise ConfigurationError(f"{location}.sentence must be non-empty")
        if not isinstance(raw_sentence["units"], list):
            raise ConfigurationError(f"{location}.units must be a list")
        expected, _ = generate_plan(raw_sentence["sentence"], nlp)
        if len(expected["sentences"]) != 1 or expected["sentences"][0]["sentence"] != raw_sentence["sentence"]:
            raise ConfigurationError(f"{location}.sentence must contain exactly one sentence")
        for unit_index, unit in enumerate(raw_sentence["units"]):
            unit_location = f"{location}.units[{unit_index}]"
            _exact_keys(unit, {"text", "span", "kind"}, unit_location)
            _exact_keys(unit["span"], {"start", "end"}, f"{unit_location}.span")
            start, end = unit["span"]["start"], unit["span"]["end"]
            if (
                type(start) is not int
                or type(end) is not int
                or start < 0
                or start >= end
                or end > len(raw_sentence["sentence"])
            ):
                raise ConfigurationError(f"{unit_location} has invalid span bounds")
            rebuilt = raw_sentence["sentence"][start:end]
            if rebuilt != unit["text"]:
                raise ConfigurationError(f"{unit_location}.text does not match its source span")
            if not isinstance(unit["kind"], str) or unit["kind"] not in {"word", "phrase", "sentence"}:
                raise ConfigurationError(f"{unit_location}.kind is unsupported")
        if raw_sentence["units"] != expected["sentences"][0]["units"]:
            raise ConfigurationError(f"{location}.units do not match the adjacent-subtree derivation")
        checked.append(raw_sentence)
    return {
        "schema_version": PLAN_SCHEMA_VERSION,
        "algorithm_version": ALGORITHM_VERSION,
        "spacy_version": SPACY_VERSION,
        "model_version": MODEL_VERSION,
        "sentences": checked,
    }


def _markdown_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("|", "\\|").replace("\n", "<br>")


def _render_dependency_tree(tokens: Sequence[Mapping[str, Any]]) -> str:
    by_index = {token["index"]: token for token in tokens}
    children: dict[int, list[int]] = {index: [] for index in by_index}
    roots = []
    for index, token in by_index.items():
        head_index = token["head_index"]
        if head_index == index or head_index not in by_index:
            roots.append(index)
        else:
            children[head_index].append(index)
    for child_indices in children.values():
        child_indices.sort()

    lines: list[str] = []
    visited: set[int] = set()

    def add_node(index: int, prefix: str, is_last: bool, is_root: bool = False) -> None:
        if index in visited:
            return
        visited.add(index)
        token = by_index[index]
        label = "ROOT" if is_root else token["dep"]
        connector = "" if is_root else ("└── " if is_last else "├── ")
        lines.append(f"{prefix}{connector}{token['text']} [{label}, {token['pos']}]")
        descendants = children[index]
        child_prefix = prefix if is_root else prefix + ("    " if is_last else "│   ")
        for child_position, child_index in enumerate(descendants):
            add_node(
                child_index,
                child_prefix,
                child_position == len(descendants) - 1,
            )

    for root_index in roots:
        add_node(root_index, "", True, is_root=True)
    for index in by_index:
        if index not in visited:
            add_node(index, "", True, is_root=True)
    return "\n".join(lines)


def _exercise_steps(
    sentence: Mapping[str, Any],
    trace: Mapping[str, Any] | None,
) -> list[tuple[int, bool]]:
    if trace is None:
        raise ConfigurationError("review mode requires a regenerated derivation trace")

    by_span = {
        (unit["span"]["start"], unit["span"]["end"]): index
        for index, unit in enumerate(sentence["units"])
    }
    steps: list[tuple[int, bool]] = []
    for index, operand_spans in enumerate(trace["sources"]):
        if operand_spans is not None:
            try:
                operands = [by_span[span] for span in operand_spans]
            except KeyError as error:
                raise ConfigurationError(f"review source is absent from the plan: {error}") from error
            if any(operand >= index for operand in operands):
                raise ConfigurationError("review source must precede its combination")
            # Revisit the other operand first when one has just been introduced.
            if index - 1 in operands:
                operands.sort(key=lambda operand: operand == index - 1)
            else:
                operands.sort(key=lambda operand: sentence["units"][operand]["span"]["start"])
            for operand in operands:
                if not steps or steps[-1] != (operand, True):
                    steps.append((operand, True))
        steps.append((index, False))
    return steps


def render_markdown(
    plan: Mapping[str, Any],
    translations: Mapping[str, Any],
    traces: Sequence[Mapping[str, Any]] | None = None,
) -> str:
    lines = ["# 渐进学习单元", ""]
    for sentence_index, (sentence, translated) in enumerate(zip(plan["sentences"], translations["sentences"], strict=True), start=1):
        lines.extend([
            f"## 第 {sentence_index} 句",
            "",
            "### 依存关系树",
            "",
            "```text",
            _render_dependency_tree(traces[sentence_index - 1]["tree_tokens"])
            if traces is not None
            else "（依存关系树不可用）",
            "```",
            "",
            f"中文提示：{translated['sentence_chinese']}",
            "",
            "| 序号 | 英文答案 | 组合说明 |",
            "|---:|---|---|",
        ])
        explanations = traces[sentence_index - 1]["explanations"] if traces is not None else [
            "" for _ in sentence["units"]
        ]
        sentence_trace = traces[sentence_index - 1] if traces is not None else None
        for step, (unit_index, is_review) in enumerate(
            _exercise_steps(sentence, sentence_trace), start=1
        ):
            unit = sentence["units"][unit_index]
            explanation = "复习" if is_review else explanations[unit_index]
            lines.append(
                f"| {step} | {_markdown_escape(unit['text'])} | {_markdown_escape(explanation)} |"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"

def render_phraseweave(
    plan: Mapping[str, Any],
    translations: Mapping[str, Any],
    traces: Sequence[Mapping[str, Any]] | None = None,
) -> str:
    if traces is None:
        raise ConfigurationError("PhraseWeave export requires a regenerated derivation trace")
    statements = []
    for sentence_index, (sentence, translated) in enumerate(zip(plan["sentences"], translations["sentences"], strict=True)):
        sentence_trace = traces[sentence_index]
        unit_ids = [f"{sentence_index}:{index}" for index in range(len(sentence["units"]))]
        by_span = {
            (unit["span"]["start"], unit["span"]["end"]): index
            for index, unit in enumerate(sentence["units"])
        }
        for unit_index, _ in _exercise_steps(sentence, sentence_trace):
            unit = sentence["units"][unit_index]
            span = unit["span"]
            source_spans = sentence_trace["sources"][unit_index]
            source_ids = [] if source_spans is None else [
                unit_ids[by_span[span]]
                for span in sorted(source_spans, key=lambda span: span[0])
            ]
            statements.append({
                "english": unit["text"],
                "context_before": sentence["sentence"][:span["start"]],
                "context_after": sentence["sentence"][span["end"]:],
                "sentence_chinese": translated["sentence_chinese"],
                "unit_id": unit_ids[unit_index],
                "source_unit_ids": source_ids,
            })
    return json.dumps({"schema_version": PHRASEWEAVE_SCHEMA_VERSION, "statements": statements}, ensure_ascii=False, indent=2) + "\n"


def render_trace(traces: Sequence[Mapping[str, Any]]) -> str:
    lines = ["# 组合结果", ""]
    for index, trace in enumerate(traces, start=1):
        # Keep wrapped source text on one Markdown line, with ordinary spaces.
        sentence = " ".join(trace["sentence"].split())
        lines.extend([
            f"## 第 {index} 句：{sentence}",
            "",
            "| 序号 | 学习单元 | 组合说明 |",
            "|---:|---|---|",
        ])
        for unit_index, (unit, explanation) in enumerate(
            zip(trace["units"], trace["explanations"], strict=True), start=1
        ):
            unit_text = _markdown_escape(" ".join(unit["text"].split()))
            lines.append(f"| {unit_index} | {unit_text} | {_markdown_escape(explanation)} |")
        if trace["blocked"]:
            lines.extend(["", "未闭合分支："])
            for item in trace["blocked"]:
                lines.append(f"- {item['head']} → {item['child']}：{item['reason']}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
