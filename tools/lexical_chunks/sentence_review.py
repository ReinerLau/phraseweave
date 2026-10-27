"""Split source text into sentences and comma-segment practice."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence

SCHEMA_VERSION = 4
PRACTICE_SEQUENCE = "comma-segments-v1"
ABBREVIATIONS = frozenset(
    {"mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e"}
)
CLOSING_MARKS = frozenset('"\'”’)]}')
BOUNDARY_MARKS = frozenset(".!?")


def _period_is_internal(text: str, index: int) -> bool:
    if (
        index > 0
        and index + 1 < len(text)
        and text[index - 1].isdigit()
        and text[index + 1].isdigit()
    ):
        return True
    prefix = text[:index + 1]
    token = re.search(r"([A-Za-z]+(?:\.[A-Za-z]+)*)\.$", prefix)
    if not token:
        return False
    if token.group(1).lower() in ABBREVIATIONS:
        return True
    return bool(re.fullmatch(r"(?:[A-Za-z]\.)+[A-Za-z]", token.group(1)))


def split_sentences(text: str) -> list[str]:
    """Preserve each sentence's source spelling and internal whitespace."""
    source = text.strip()
    if not source:
        raise ValueError("Enter English text before generating.")

    sentences: list[str] = []
    start = 0
    index = 0
    while index < len(source):
        if source[index] == "\n":
            gap = re.match(r"\n[\t \r\n]*\n", source[index:])
            if gap:
                sentence = source[start:index].strip()
                if sentence:
                    sentences.append(sentence)
                index += len(gap.group())
                start = index
                continue
        if source[index] not in BOUNDARY_MARKS or (
            source[index] == "." and _period_is_internal(source, index)
        ):
            index += 1
            continue

        end = index + 1
        while end < len(source) and source[end] in BOUNDARY_MARKS:
            end += 1
        while end < len(source) and source[end] in CLOSING_MARKS:
            end += 1
        if end < len(source) and not source[end].isspace():
            index = end
            continue
        sentence = source[start:end].strip()
        if sentence:
            sentences.append(sentence)
        start = end
        while start < len(source) and source[start].isspace():
            start += 1
        index = start

    tail = source[start:].strip()
    if tail:
        sentences.append(tail)
    if not sentences:
        raise ValueError("No English sentences were found in the input.")
    for number, sentence in enumerate(sentences, start=1):
        if not any(character.isalnum() for character in sentence):
            raise ValueError(f"Sentence {number} has no word tokens.")
    return sentences


def practice_spans(sentence: str) -> list[tuple[int, int]]:
    """Return clauses with words, then the complete sentence."""
    segments: list[tuple[int, int]] = []

    def append_segment(start: int, end: int) -> None:
        while start < end and sentence[start].isspace():
            start += 1
        while end > start and sentence[end - 1].isspace():
            end -= 1
        if any(character.isalnum() for character in sentence[start:end]):
            segments.append((start, end))

    start = 0
    for index, character in enumerate(sentence):
        if character != "," or (
            index > 0 and index + 1 < len(sentence)
            and sentence[index - 1].isdigit() and sentence[index + 1].isdigit()
        ):
            continue
        append_segment(start, index)
        start = index + 1
    append_segment(start, len(sentence))
    return segments + [(0, len(sentence))] if len(segments) > 1 else [(0, len(sentence))]


def render_markdown(sentences: Sequence[str], chinese: Sequence[Sequence[str]]) -> str:
    lines = ["# 逗号分段与整句复现", ""]
    for index, (sentence, prompts) in enumerate(zip(sentences, chinese, strict=True), start=1):
        spans = practice_spans(sentence)
        if len(prompts) != len(spans):
            raise ValueError("Translation count does not match practice spans.")
        lines.extend([f"## 第 {index} 句", ""])
        for step, ((start, end), prompt) in enumerate(zip(spans, prompts, strict=True), start=1):
            label = "整句" if step == len(spans) else f"第 {step} 段"
            lines.extend([f"### {label}", "", f"中文提示：{prompt}", "", sentence[start:end], ""])
    return "\n".join(lines).rstrip() + "\n"


def render_phraseweave(sentences: Sequence[str], chinese: Sequence[Sequence[str]]) -> str:
    statements = []
    for index, (sentence, prompts) in enumerate(zip(sentences, chinese, strict=True)):
        spans = practice_spans(sentence)
        if len(prompts) != len(spans):
            raise ValueError("Translation count does not match practice spans.")
        for step, ((start, end), prompt) in enumerate(zip(spans, prompts, strict=True)):
            statements.append({
                "english": sentence[start:end],
                "context_before": sentence[:start],
                "context_after": sentence[end:],
                "sentence_chinese": prompt,
                "unit_id": f"{index}:{step}",
                "source_unit_ids": [],
            })
    return (
        json.dumps(
            {
                "schema_version": SCHEMA_VERSION,
                "practice_sequence": PRACTICE_SEQUENCE,
                "statements": statements,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
