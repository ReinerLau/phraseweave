#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
#   "spacy==3.8.7",
# ]
# ///

"""Generate learning units from explicit dependency paths."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections.abc import Mapping, Sequence
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

SPACY_VERSION = "3.8.7"
MODEL_DISTRIBUTION = "en-core-web-sm"
MODEL_VERSION = "3.8.0"
PLAN_SCHEMA_VERSION = 2
ANNOTATION_SCHEMA_VERSION = 1
PHRASEWEAVE_SCHEMA_VERSION = 1
RULE_SCHEMA_VERSION = 8
RULE_TAGS = {
    "nominal-singleton": "S1",
    "verb-singleton": "S2",
    "adjective-adverb-singleton": "S3",
    "modifier-to-head": "U1",
    "object-through-preposition-to-head": "U2",
    "determiner-through-preposition-to-head": "U3",
    "possessor-through-preposition-to-head": "U4",
    "auxiliary-to-head": "U5",
    "adjective-complement-to-head": "U6",
    "preposition-to-head-or-object": "U7",
    "full-sentence": "FULL",
}
DEFAULT_RULES = Path(__file__).resolve().parents[1] / "rules" / "closure-rules.json"
DEFAULT_OUTPUT = Path("outputs/lexical-chunks/text.learning-units.md")
DEFAULT_PHRASEWEAVE_OUTPUT = Path("outputs/lexical-chunks/text.learning-units.json")


class ConfigurationError(RuntimeError):
    """Raised when rules, plans, annotations, or fixed dependencies are incompatible."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate node-local dependency-path learning units or render translations."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--plan-output", type=Path, help="analyze English from stdin")
    mode.add_argument("--render-plan", type=Path, help="render a validated plan")
    parser.add_argument("--rules", type=Path, default=DEFAULT_RULES, help="dependency path rules JSON")
    parser.add_argument("--trace-output", type=Path, help="write a Markdown derivation trace")
    parser.add_argument("--output", type=Path, help="Markdown or PhraseWeave output path")
    parser.add_argument(
        "--format", choices=("markdown", "phraseweave", "both"), default="markdown"
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


def load_rules(path: Path) -> tuple[dict[str, Any], str]:
    try:
        raw = path.expanduser().read_bytes()
        rules = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"cannot load dependency-path rules from {path}: {error}") from error
    _exact_keys(rules, {"schema_version", "max_units_per_anchor", "singleton_rules", "unit_rules"}, "rules")
    if rules["schema_version"] != RULE_SCHEMA_VERSION:
        raise ConfigurationError(f"rules must use schema_version {RULE_SCHEMA_VERSION}")
    if not isinstance(rules["max_units_per_anchor"], int) or rules["max_units_per_anchor"] < 1:
        raise ConfigurationError("rules.max_units_per_anchor must be a positive integer")
    if not isinstance(rules["singleton_rules"], list) or not isinstance(rules["unit_rules"], list):
        raise ConfigurationError("rules.singleton_rules and rules.unit_rules must be lists")
    for index, rule in enumerate(rules["singleton_rules"]):
        _exact_keys(rule, {"id", "priority", "when"}, f"rules.singleton_rules[{index}]")
        if not isinstance(rule["id"], str) or not isinstance(rule["priority"], int) or not isinstance(rule["when"], dict):
            raise ConfigurationError(f"rules.singleton_rules[{index}] has invalid fields")
        _validate_condition(rule["when"], f"rules.singleton_rules[{index}].when")
    for index, rule in enumerate(rules["unit_rules"]):
        location = f"rules.unit_rules[{index}]"
        _exact_keys(rule, {"id", "anchor", "slots"}, location)
        if not isinstance(rule["id"], str):
            raise ConfigurationError(f"{location}.id must be a string")
        if not isinstance(rule["anchor"], dict) or not isinstance(rule["slots"], list):
            raise ConfigurationError(f"{location} needs an anchor condition and slot list")
        _validate_condition(rule["anchor"], f"{location}.anchor")
        slot_ids = {"anchor"}
        required_ids = {"anchor"}
        for slot_index, slot in enumerate(rule["slots"]):
            slot_location = f"{location}.slots[{slot_index}]"
            _exact_keys(slot, {"id", "from", "direction", "token", "required"}, slot_location)
            if not isinstance(slot["id"], str) or slot["id"] in slot_ids:
                raise ConfigurationError(f"{slot_location}.id must be unique within its rule")
            if not isinstance(slot["from"], str) or slot["from"] not in slot_ids:
                raise ConfigurationError(f"{slot_location}.from must refer to anchor or an earlier slot")
            if not isinstance(slot["direction"], (str, list)):
                raise ConfigurationError(f"{slot_location}.direction must be head, child, or a list of both")
            directions = slot["direction"] if isinstance(slot["direction"], list) else [slot["direction"]]
            if not directions or not all(isinstance(direction, str) and direction in {"head", "child"} for direction in directions):
                raise ConfigurationError(f"{slot_location}.direction must contain head and/or child")
            if len(set(directions)) != len(directions):
                raise ConfigurationError(f"{slot_location}.direction cannot repeat a direction")
            if not isinstance(slot["token"], dict):
                raise ConfigurationError(f"{slot_location}.token must be an object")
            _validate_condition(slot["token"], f"{slot_location}.token")
            if not isinstance(slot["required"], bool):
                raise ConfigurationError(f"{slot_location}.required must be a boolean")
            if slot["required"]:
                if slot["from"] not in required_ids:
                    raise ConfigurationError(f"{slot_location}.from cannot refer to an optional slot")
                required_ids.add(slot["id"])
            slot_ids.add(slot["id"])
        if sum(not slot["required"] for slot in rule["slots"]) > 1:
            raise ConfigurationError(f"{location} may define at most one optional slot")
    digest = hashlib.sha256(raw).hexdigest()
    return rules, digest


def _exact_keys(value: Any, keys: set[str], location: str) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise ConfigurationError(f"{location} must contain exactly: {', '.join(sorted(keys))}")


def _validate_condition(condition: Mapping[str, Any], location: str) -> None:
    unsupported = set(condition) - {"pos", "dep"}
    if unsupported:
        names = ", ".join(sorted(unsupported))
        raise ConfigurationError(f"{location} only supports POS and dependency labels; unsupported: {names}")
    for key, value in condition.items():
        values = value if isinstance(value, list) else [value]
        if not values or not all(isinstance(item, str) for item in values):
            raise ConfigurationError(f"{location}.{key} must be a string or non-empty list of strings")


def _values(condition: Mapping[str, Any], key: str) -> set[str] | None:
    value = condition.get(key)
    if value is None:
        return None
    return set(value if isinstance(value, list) else [value])


def _matches(token: Any, condition: Mapping[str, Any]) -> bool:
    return all(
        actual in expected
        for key, actual in (("pos", token.pos_), ("dep", token.dep_))
        if (expected := _values(condition, key)) is not None
    )


def _slot_targets(token: Any, slot: Mapping[str, Any]) -> list[tuple[Any, str]]:
    directions = slot["direction"] if isinstance(slot["direction"], list) else [slot["direction"]]
    matches = []
    for direction in directions:
        if direction == "head":
            candidates = [] if token.head.i == token.i else [token.head]
        else:
            candidates = list(token.children)
        matches.extend(
            (candidate, direction)
            for candidate in candidates
            if _matches(candidate, slot["token"])
        )
    return matches


def _sentence_segments(sentence: str, sent: Any, token_ids: set[int]) -> list[dict[str, int]]:
    selected = [token for token in sent if token.i in token_ids and not token.is_punct and not token.is_space]
    if not selected:
        return []
    runs: list[list[Any]] = [[selected[0]]]
    for token in selected[1:]:
        if token.i == runs[-1][-1].i + 1:
            runs[-1].append(token)
        else:
            runs.append([token])
    sentence_start = sent.start_char + (len(sent.text) - len(sent.text.lstrip()))
    return [
        {
            "start": run[0].idx - sentence_start,
            "end": run[-1].idx + len(run[-1].text) - sentence_start,
        }
        for run in runs
    ]


def _segments_text(sentence: str, segments: Sequence[Mapping[str, int]]) -> str:
    return " ".join(sentence[item["start"] : item["end"]] for item in segments)


def _build_sentence(sentence_span: Any, rules: Mapping[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    sentence = sentence_span.text.strip()
    sent = sentence_span
    tokens = [token for token in sent if not token.is_space and not token.is_punct]
    by_id = {token.i: token for token in tokens}
    trace: dict[str, Any] = {"tokens": [], "rule_matches": [], "unmatched_edges": [], "derivations": []}
    generated: dict[tuple[int, ...], dict[str, Any]] = {}
    matched_edges: set[tuple[int, int]] = set()
    postorder: dict[int, int] = {}
    visited: set[int] = set()

    def record(anchor: Any, token_ids: set[int], rule_id: str, kind: str) -> None:
        key = tuple(sorted(token_ids))
        if len(key) == 1 and key[0] not in by_id:
            return
        unit = generated.setdefault(
            key,
            {"anchor": anchor.i, "tokens": set(token_ids), "rule_ids": [], "kind": kind},
        )
        if rule_id not in unit["rule_ids"]:
            unit["rule_ids"].append(rule_id)
        trace["rule_matches"].append({"token": anchor.text, "rule": rule_id, "type": kind})
        trace["derivations"].append(
            {"anchor": anchor.text, "tokens": list(key), "rules": [rule_id]}
        )

    def process_node(token: Any) -> None:
        trace["tokens"].append(
            {"text": token.text, "pos": token.pos_, "dep": token.dep_, "head": token.head.text}
        )
        matches = [rule for rule in rules["singleton_rules"] if _matches(token, rule["when"])]
        if matches:
            priority = max(rule["priority"] for rule in matches)
            winners = [rule for rule in matches if rule["priority"] == priority]
            if len(winners) > 1:
                raise ConfigurationError(
                    f"ambiguous singleton rules for token {token.text!r}: "
                    + ", ".join(rule["id"] for rule in winners)
                )
            record(token, {token.i}, winners[0]["id"], "singleton")

        anchor = token
        anchor_state_count = 0
        for rule in rules["unit_rules"]:
            if not _matches(anchor, rule["anchor"]):
                continue
            states: list[dict[str, Any]] = [{
                "bindings": {"anchor": anchor},
                "tokens": {anchor.i},
                "edges": set(),
            }]
            for slot in rule["slots"]:
                if not slot["required"]:
                    continue
                expanded: list[dict[str, Any]] = []
                for state in states:
                    source = state["bindings"][slot["from"]]
                    for target, direction in _slot_targets(source, slot):
                        if target.i in state["tokens"]:
                            continue
                        edge = (
                            (target.i, source.i)
                            if direction == "head"
                            else (source.i, target.i)
                        )
                        expanded.append({
                            "bindings": {**state["bindings"], slot["id"]: target},
                            "tokens": state["tokens"] | {target.i},
                            "edges": state["edges"] | {edge},
                        })
                states = expanded
                if len(states) + anchor_state_count > rules["max_units_per_anchor"]:
                    raise ConfigurationError(
                        f"path rules exceed {rules['max_units_per_anchor']} units at token {anchor.text!r}"
                    )
                if not states:
                    break
            for state in states:
                # An empty required path denotes the anchor itself; reuse an existing singleton.
                if len(state["tokens"]) > 1 or tuple(sorted(state["tokens"])) not in generated:
                    record(anchor, state["tokens"], rule["id"], "path")
                matched_edges.update(state["edges"])
                anchor_state_count += 1
                if anchor_state_count > rules["max_units_per_anchor"]:
                    raise ConfigurationError(
                        f"path rules exceed {rules['max_units_per_anchor']} units at token {anchor.text!r}"
                    )

    def visit(token: Any) -> None:
        if token.i in visited:
            return
        visited.add(token.i)
        for child in sorted(
            (child for child in token.children if not child.is_punct and not child.is_space),
            key=lambda child: child.i,
        ):
            visit(child)
        process_node(token)
        postorder[token.i] = len(postorder)

    for token in tokens:
        if token.head.i == token.i:
            visit(token)
    for token in tokens:
        visit(token)

    for token in tokens:
        if token.head.i != token.i and (token.head.i, token.i) not in matched_edges:
            trace["unmatched_edges"].append(
                {"head": token.head.text, "child": token.text, "dep": token.dep_}
            )

    units: list[dict[str, Any]] = []
    for state in generated.values():
        segments = _sentence_segments(sentence, sent, state["tokens"])
        if not segments:
            continue
        text = _segments_text(sentence, segments)
        if text == sentence:
            continue
        content_count = sum(
            by_id[index].pos_ in {"ADJ", "ADV", "NOUN", "NUM", "PROPN", "PRON", "VERB"}
            for index in state["tokens"]
        )
        units.append({
            "text": text,
            "segments": segments,
            "kind": "base" if content_count <= 1 else "composition",
            "_anchor": state["anchor"],
            "_tokens": tuple(sorted(state["tokens"])),
        })
    units.sort(
        key=lambda unit: (
            postorder.get(unit["_anchor"], 0),
            len(unit["_tokens"]),
            unit["segments"][0]["start"],
            unit["_tokens"],
        )
    )
    output = [{key: unit[key] for key in ("text", "segments", "kind")} for unit in units]
    output.append({"text": sentence, "segments": [{"start": 0, "end": len(sentence)}], "kind": "sentence"})
    trace["unit_rules"] = [
        {"text": unit["text"], "rules": generated[unit["_tokens"]]["rule_ids"]}
        for unit in units
    ]
    trace["unit_rules"].append({
        "text": sentence,
        "rules": ["full-sentence"],
    })
    return output, trace


def generate_plan(text: str, nlp: Any, rules: Mapping[str, Any], rules_digest: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not text.strip():
        raise ConfigurationError("No English text was provided on stdin.")
    document = nlp(text)
    sentences: list[dict[str, Any]] = []
    traces: list[dict[str, Any]] = []
    for sentence_span in document.sents:
        sentence = sentence_span.text.strip()
        if sentence:
            units, trace = _build_sentence(sentence_span, rules)
            sentences.append({"sentence": sentence, "units": units})
            traces.append({"sentence": sentence, "units": units, **trace})
    if not sentences:
        raise ConfigurationError("spaCy did not find any sentences in the input.")
    return {
        "schema_version": PLAN_SCHEMA_VERSION,
        "rules_version": rules["schema_version"],
        "rules_sha256": rules_digest,
        "sentences": sentences,
    }, traces


def _validate_plan(payload: Any, nlp: Any, rules: Mapping[str, Any], rules_digest: str) -> dict[str, Any]:
    _exact_keys(payload, {"schema_version", "rules_version", "rules_sha256", "sentences"}, "plan")
    if payload["schema_version"] != PLAN_SCHEMA_VERSION:
        raise ConfigurationError(f"plan must use schema_version {PLAN_SCHEMA_VERSION}")
    if payload["rules_version"] != rules["schema_version"] or payload["rules_sha256"] != rules_digest:
        raise ConfigurationError("plan dependency-path rules do not match the selected rules file")
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
        expected, _ = generate_plan(raw_sentence["sentence"], nlp, rules, rules_digest)
        if len(expected["sentences"]) != 1 or expected["sentences"][0]["sentence"] != raw_sentence["sentence"]:
            raise ConfigurationError(f"{location}.sentence must contain exactly one sentence")
        for unit_index, unit in enumerate(raw_sentence["units"]):
            unit_location = f"{location}.units[{unit_index}]"
            _exact_keys(unit, {"text", "segments", "kind"}, unit_location)
            if not isinstance(unit["segments"], list) or not unit["segments"]:
                raise ConfigurationError(f"{unit_location}.segments must be a non-empty list")
            previous_end = -1
            for segment in unit["segments"]:
                _exact_keys(segment, {"start", "end"}, f"{unit_location}.segments[]")
                start, end = segment["start"], segment["end"]
                if not isinstance(start, int) or not isinstance(end, int) or start < 0 or start >= end:
                    raise ConfigurationError(f"{unit_location} has invalid segment bounds")
                if end > len(raw_sentence["sentence"]) or start < previous_end:
                    raise ConfigurationError(f"{unit_location} segments are out of range or order")
                previous_end = end
            rebuilt = _segments_text(raw_sentence["sentence"], unit["segments"])
            if rebuilt != unit["text"]:
                raise ConfigurationError(f"{unit_location}.text does not match its source segments")
            if unit["kind"] not in {"base", "composition", "sentence"}:
                raise ConfigurationError(f"{unit_location}.kind is unsupported")
        if raw_sentence["units"] != expected["sentences"][0]["units"]:
            raise ConfigurationError(f"{location}.units do not match the dependency-path rule derivation")
        checked.append(raw_sentence)
    return {"schema_version": PLAN_SCHEMA_VERSION, "rules_version": rules["schema_version"], "rules_sha256": rules_digest, "sentences": checked}


def _parse_annotations(text: str, plan: Mapping[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise ConfigurationError(f"invalid translation JSON: {error}") from error
    _exact_keys(payload, {"schema_version", "sentences"}, "translations")
    if payload["schema_version"] != ANNOTATION_SCHEMA_VERSION:
        raise ConfigurationError(f"translations must use schema_version {ANNOTATION_SCHEMA_VERSION}")
    raw_sentences = payload["sentences"]
    if not isinstance(raw_sentences, list) or len(raw_sentences) != len(plan["sentences"]):
        raise ConfigurationError("translations.sentences must align with the plan")
    sentences = []
    for index, (raw, planned) in enumerate(zip(raw_sentences, plan["sentences"], strict=True)):
        location = f"translations.sentences[{index}]"
        _exact_keys(raw, {"unit_prompts"}, location)
        prompts = raw["unit_prompts"]
        if not isinstance(prompts, list) or len(prompts) != len(planned["units"]):
            raise ConfigurationError(f"{location}.unit_prompts must contain exactly {len(planned['units'])} items")
        if not all(isinstance(prompt, str) and prompt.strip() for prompt in prompts):
            raise ConfigurationError(f"{location}.unit_prompts must contain non-empty strings")
        sentences.append({"unit_prompts": [prompt.strip() for prompt in prompts]})
    return {"schema_version": ANNOTATION_SCHEMA_VERSION, "sentences": sentences}


def _markdown_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("|", "\\|").replace("\n", "<br>")


def render_markdown(plan: Mapping[str, Any], translations: Mapping[str, Any]) -> str:
    lines = ["# 渐进学习单元", ""]
    for sentence_index, (sentence, translated) in enumerate(zip(plan["sentences"], translations["sentences"], strict=True), start=1):
        lines.extend([f"## 第 {sentence_index} 句", "", "| 步骤 | 中文提示 | 英文答案 | 类型 |", "|---:|---|---|---|"])
        for step, (unit, prompt) in enumerate(zip(sentence["units"], translated["unit_prompts"], strict=True), start=1):
            label = {"base": "单词单元", "composition": "依存路径单元", "sentence": "完整原句"}[unit["kind"]]
            lines.append(f"| {step} | {_markdown_escape(prompt)} | {_markdown_escape(unit['text'])} | {label} |")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_phraseweave(plan: Mapping[str, Any], translations: Mapping[str, Any]) -> str:
    statements = []
    for sentence, translated in zip(plan["sentences"], translations["sentences"], strict=True):
        for unit, prompt in zip(sentence["units"], translated["unit_prompts"], strict=True):
            statements.append({"chinese": prompt, "english": unit["text"], "soundmark": ""})
    return json.dumps({"schema_version": PHRASEWEAVE_SCHEMA_VERSION, "statements": statements}, ensure_ascii=False, indent=2) + "\n"


def render_trace(traces: Sequence[Mapping[str, Any]]) -> str:
    lines = ["# 组合结果", ""]
    for index, trace in enumerate(traces, start=1):
        # Keep wrapped source text on one Markdown line, with ordinary spaces.
        sentence = " ".join(trace["sentence"].split())
        lines.extend([
            f"## 第 {index} 句：{sentence}",
            "",
            "| 序号 | 学习单元 | 规则标签 |",
            "|---:|---|---|",
        ])
        for unit_index, (unit, match) in enumerate(
            zip(trace["units"], trace["unit_rules"], strict=True), start=1
        ):
            unit_text = _markdown_escape(" ".join(unit["text"].split()))
            labels = [RULE_TAGS.get(rule_id, rule_id) for rule_id in match["rules"]]
            rules_text = _markdown_escape("、".join(labels))
            lines.append(f"| {unit_index} | {unit_text} | {rules_text} |")
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
    requested = args.output or (DEFAULT_PHRASEWEAVE_OUTPUT if args.format == "phraseweave" else DEFAULT_OUTPUT)
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
        rules, rules_digest = load_rules(args.rules)
        nlp = load_syntax_model()
        if args.plan_output is not None:
            plan, traces = generate_plan(sys.stdin.read(), nlp, rules, rules_digest)
            plan_path = _write_output(args.plan_output, json.dumps(plan, ensure_ascii=False, indent=2) + "\n")
            print(plan_path)
            _write_trace(args, traces)
            return 0
        try:
            raw_plan = json.loads(args.render_plan.expanduser().read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ConfigurationError(f"cannot read plan from {args.render_plan}: {error}") from error
        plan = _validate_plan(raw_plan, nlp, rules, rules_digest)
        translations = _parse_annotations(sys.stdin.read(), plan)
        markdown_path, phraseweave_path = _output_paths(args)
        outputs: list[tuple[Path, str]] = []
        if markdown_path is not None:
            outputs.append((markdown_path, render_markdown(plan, translations)))
        if phraseweave_path is not None:
            outputs.append((phraseweave_path, render_phraseweave(plan, translations)))
        for path, content in outputs:
            print(_write_output(path, content))
        if args.trace_output is not None:
            traces = []
            for sentence in plan["sentences"]:
                _, sentence_traces = generate_plan(sentence["sentence"], nlp, rules, rules_digest)
                traces.extend(sentence_traces)
            _write_trace(args, traces)
        return 0
    except ConfigurationError as error:
        print(f"lexical-chunks: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
