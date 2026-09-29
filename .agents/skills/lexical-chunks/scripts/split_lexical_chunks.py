#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "click",
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
#   "spacy==3.8.7",
# ]
# ///

"""Generate learning units by closing adjacent dependency subtrees."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

SPACY_VERSION = "3.8.7"
MODEL_DISTRIBUTION = "en-core-web-sm"
MODEL_VERSION = "3.8.0"
PLAN_SCHEMA_VERSION = 3
ALGORITHM_VERSION = 5
ANNOTATION_SCHEMA_VERSION = 2
PHRASEWEAVE_SCHEMA_VERSION = 4
DOUBLE_QUOTES = frozenset({'"', "“", "”"})
DEFAULT_OUTPUT = Path("outputs/lexical-chunks/text.learning-units.md")
DEFAULT_PHRASEWEAVE_OUTPUT = Path("outputs/lexical-chunks/text.learning-units.json")
DEFAULT_REVIEW_OUTPUT = Path("outputs/lexical-chunks/text.review.learning-units.md")
DEFAULT_REVIEW_PHRASEWEAVE_OUTPUT = Path("outputs/lexical-chunks/text.review.learning-units.json")


class ConfigurationError(RuntimeError):
    """Raised when plans, annotations, or fixed dependencies are incompatible."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate adjacent dependency-subtree learning units or render translations."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan-output", type=Path, help="analyze English from stdin")
    mode.add_argument("--render-plan", type=Path, help="render a validated plan")
    parser.add_argument("--trace-output", type=Path, help="write a Markdown derivation trace")
    parser.add_argument("--output", type=Path, help="Markdown or PhraseWeave output path")
    parser.add_argument(
        "--format", choices=("markdown", "phraseweave", "both"), default="markdown"
    )
    parser.add_argument(
        "--mode", choices=("standard", "review"), default="standard",
        help="exercise mode for rendered output",
    )
    parser.add_argument("--phraseweave-output", type=Path)
    return parser.parse_args()


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


def _remove_double_quotes(text: str) -> str:
    clean: list[str] = []
    for index, char in enumerate(text):
        if char not in DOUBLE_QUOTES:
            clean.append(char)
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
    return "".join(clean)


def _build_sentence(sentence_span: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    sentence = sentence_span.text.strip()
    sentence_start = sentence_span.start_char + (
        len(sentence_span.text) - len(sentence_span.text.lstrip())
    )
    tokens = [token for token in sentence_span if not token.is_space and not token.is_punct]
    if not tokens:
        raise ConfigurationError(f"sentence has no word tokens: {sentence!r}")
    token_by_id = {token.i: token for token in tokens}
    units: list[dict[str, Any]] = []
    explanations: list[str] = []
    sources: list[tuple[tuple[int, int], ...] | None] = []
    seen_spans: set[tuple[int, int]] = set()
    blocked: list[dict[str, str]] = []
    completed: dict[int, tuple[int, int] | None] = {}

    def phrase_text(bounds: tuple[int, int]) -> str:
        first, last = (sentence_span.doc[index] for index in bounds)
        return sentence[first.idx - sentence_start : last.idx + len(last.text) - sentence_start]

    def source_span(bounds: tuple[int, int]) -> tuple[int, int]:
        first, last = (sentence_span.doc[index] for index in bounds)
        return first.idx - sentence_start, last.idx + len(last.text) - sentence_start

    def record(
        bounds: tuple[int, int],
        kind: str,
        explanation: str,
        operands: tuple[tuple[int, int], tuple[int, int]] | None = None,
        source_spans: tuple[tuple[int, int], tuple[int, int]] | None = None,
    ) -> None:
        first, last = (sentence_span.doc[index] for index in bounds)
        start = first.idx - sentence_start
        end = last.idx + len(last.text) - sentence_start
        if (start, end) in seen_spans:
            return
        seen_spans.add((start, end))
        units.append({
            "text": sentence[start:end],
            "span": {"start": start, "end": end},
            "kind": kind,
        })
        explanations.append(explanation)
        if source_spans is not None:
            sources.append(source_spans)
        elif operands is not None:
            sources.append(tuple(source_span(operand) for operand in operands))
        else:
            sources.append(None)

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
                ((index, bounds) for index, bounds in remaining.items() if bounds[1] == current[0] - 1),
                None,
            )
            right = next(
                ((index, bounds) for index, bounds in remaining.items() if bounds[0] == current[1] + 1),
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
    first, last = tokens[0], tokens[-1]
    full_start = first.idx - sentence_start
    full_end = last.idx + len(last.text) - sentence_start
    sentence_sources = None
    for index in range(len(units) - 1, -1, -1):
        if units[index]["span"] == {"start": full_start, "end": full_end}:
            sentence_sources = sources.pop(index)
            del units[index]
            del explanations[index]
            seen_spans.remove((full_start, full_end))
            break
    record(full_bounds, "sentence", "整句", source_spans=sentence_sources)

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
    clean_text = _remove_double_quotes(text).strip()
    if not clean_text:
        raise ConfigurationError("No English text was provided on stdin.")
    document = nlp(clean_text)
    sentences: list[dict[str, Any]] = []
    traces: list[dict[str, Any]] = []
    for sentence_span in document.sents:
        sentence = sentence_span.text.strip()
        if sentence:
            units, trace = _build_sentence(sentence_span)
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


def _parse_annotations(text: str, plan: Mapping[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise ConfigurationError(f"invalid sentence prompt JSON: {error}") from error
    _exact_keys(payload, {"schema_version", "sentences"}, "prompts")
    if payload["schema_version"] != ANNOTATION_SCHEMA_VERSION:
        raise ConfigurationError(f"prompts must use schema_version {ANNOTATION_SCHEMA_VERSION}")
    raw_sentences = payload["sentences"]
    if not isinstance(raw_sentences, list) or len(raw_sentences) != len(plan["sentences"]):
        raise ConfigurationError("prompts.sentences must align with the plan")
    sentences = []
    for index, raw in enumerate(raw_sentences):
        location = f"prompts.sentences[{index}]"
        _exact_keys(raw, {"sentence_chinese"}, location)
        prompt = raw["sentence_chinese"]
        if not isinstance(prompt, str) or not prompt.strip():
            raise ConfigurationError(f"{location}.sentence_chinese must be a non-empty string")
        sentences.append({"sentence_chinese": prompt.strip()})
    return {"schema_version": ANNOTATION_SCHEMA_VERSION, "sentences": sentences}


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
    mode: str,
) -> list[tuple[int, bool]]:
    if mode == "standard":
        return [(index, False) for index in range(len(sentence["units"]))]
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
    mode: str = "standard",
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
            "| 序号 | 英文填空 | 英文答案 | 组合说明 |",
            "|---:|---|---|---|",
        ])
        explanations = traces[sentence_index - 1]["explanations"] if traces is not None else [
            "" for _ in sentence["units"]
        ]
        sentence_trace = traces[sentence_index - 1] if traces is not None else None
        for step, (unit_index, is_review) in enumerate(
            _exercise_steps(sentence, sentence_trace, mode), start=1
        ):
            unit = sentence["units"][unit_index]
            span = unit["span"]
            blank = sentence["sentence"][:span["start"]] + "____" + sentence["sentence"][span["end"]:]
            explanation = "复习" if is_review else explanations[unit_index]
            lines.append(
                f"| {step} | {_markdown_escape(blank)} | {_markdown_escape(unit['text'])} | {_markdown_escape(explanation)} |"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_phraseweave(
    plan: Mapping[str, Any],
    translations: Mapping[str, Any],
    traces: Sequence[Mapping[str, Any]] | None = None,
    mode: str = "standard",
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
        for unit_index, _ in _exercise_steps(sentence, sentence_trace, mode):
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


def _unique_path(requested: Path) -> Path:
    if not requested.exists():
        return requested
    index = 2
    while True:
        candidate = requested.with_name(f"{requested.stem}-{index}{requested.suffix}")
        if not candidate.exists():
            return candidate
        index += 1


def _write_output(path: Path, content: str) -> Path:
    output = _unique_path(path.expanduser()).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content, encoding="utf-8")
    return output


def _output_paths(args: argparse.Namespace) -> tuple[Path | None, Path | None]:
    if args.mode == "review":
        default = DEFAULT_REVIEW_PHRASEWEAVE_OUTPUT if args.format == "phraseweave" else DEFAULT_REVIEW_OUTPUT
    else:
        default = DEFAULT_PHRASEWEAVE_OUTPUT if args.format == "phraseweave" else DEFAULT_OUTPUT
    requested = args.output or default
    if args.format == "markdown":
        return requested, None
    if args.format == "phraseweave":
        return None, requested
    phraseweave = args.phraseweave_output or requested.with_suffix(".json")
    if requested.expanduser().resolve() == phraseweave.expanduser().resolve():
        raise ConfigurationError("Markdown and PhraseWeave outputs must use different paths")
    return requested, phraseweave


def _write_trace(args: argparse.Namespace, traces: Sequence[Mapping[str, Any]]) -> None:
    if args.trace_output is not None:
        print(_write_output(args.trace_output, render_trace(traces)))


def main() -> int:
    args = parse_args()
    try:
        nlp = load_syntax_model()
        if args.plan_output is not None:
            plan, traces = generate_plan(sys.stdin.read(), nlp)
            plan_path = _write_output(args.plan_output, json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
            print(plan_path)
            _write_trace(args, traces)
            return 0
        try:
            raw_plan = json.loads(args.render_plan.expanduser().read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ConfigurationError(f"cannot read plan from {args.render_plan}: {error}") from error
        plan = _validate_plan(raw_plan, nlp)
        translations = _parse_annotations(sys.stdin.read(), plan)
        markdown_path, phraseweave_path = _output_paths(args)
        traces = []
        if markdown_path is not None or phraseweave_path is not None or args.trace_output is not None or args.mode == "review":
            for sentence in plan["sentences"]:
                _, sentence_traces = generate_plan(sentence["sentence"], nlp)
                traces.extend(sentence_traces)
        outputs: list[tuple[Path, str]] = []
        if markdown_path is not None:
            outputs.append((markdown_path, render_markdown(plan, translations, traces, args.mode)))
        if phraseweave_path is not None:
            outputs.append((phraseweave_path, render_phraseweave(plan, translations, traces, args.mode)))
        for path, content in outputs:
            print(_write_output(path, content))
        if args.trace_output is not None:
            _write_trace(args, traces)
        return 0
    except ConfigurationError as error:
        print(f"lexical-chunks: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
