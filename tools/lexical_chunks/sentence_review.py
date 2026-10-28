"""Split source text into sentences and comma-segment practice."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence

SCHEMA_VERSION = 4
PRACTICE_SEQUENCE = "comma-segments-v1"
LAZY_SCHEMA_VERSION = 5
LAZY_PRACTICE_SEQUENCE = "lazy-comma-segments-v1"
PUNCTUATION_SCHEMA_VERSION = 7
PUNCTUATION_PRACTICE_SEQUENCE = "lazy-punctuation-segments-v1"
PUNCTUATION_CLAUSE_PRACTICE_SEQUENCE = "lazy-punctuation-clause-segments-v1"
ABBREVIATIONS = frozenset(
    {"mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e"}
)
CLOSING_MARKS = frozenset('"\'”’)]}')
BOUNDARY_MARKS = frozenset(".!?")
URL_TRAILING_MARKS = frozenset(".,;:—!?)]}") | frozenset({"'", '"'})


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


def punctuation_practice_spans(sentence: str) -> list[tuple[int, int]]:
    """Return new punctuation-delimited steps without changing legacy comma steps."""
    segments: list[tuple[int, int]] = []

    def append_segment(start: int, end: int) -> None:
        while start < end and sentence[start].isspace():
            start += 1
        while end > start and sentence[end - 1].isspace():
            end -= 1
        if any(character.isalnum() for character in sentence[start:end]):
            segments.append((start, end))

    word_positions = [index for index, character in enumerate(sentence) if character.isalnum()]
    first_word = word_positions[0] if word_positions else len(sentence)
    last_word = word_positions[-1] if word_positions else -1
    url_positions: set[int] = set()
    for match in re.finditer(r"\b(?:[A-Za-z][A-Za-z0-9+.-]*://|www\.)\S+", sentence):
        end = match.end()
        while end > match.start() and sentence[end - 1] in URL_TRAILING_MARKS:
            end -= 1
        url_positions.update(range(match.start(), end))
    start = 0
    for index, character in enumerate(sentence):
        if character not in ",;:—":
            continue
        if index in url_positions:
            continue
        if character in ";:" and not (first_word < index < last_word):
            continue
        before = sentence[index - 1] if index > 0 else ""
        after = sentence[index + 1] if index + 1 < len(sentence) else ""
        if character in ",:" and before.isdigit() and after.isdigit():
            continue
        if character == ":" and sentence[index + 1:index + 3] == "//":
            continue
        append_segment(start, index)
        start = index + 1
    append_segment(start, len(sentence))
    return segments + [(0, len(sentence))] if len(segments) > 1 else [(0, len(sentence))]


def utf16_spans(sentence: str, spans: Sequence[tuple[int, int]]) -> list[tuple[int, int]]:
    offsets = [0]
    for character in sentence:
        offsets.append(offsets[-1] + (2 if ord(character) > 0xFFFF else 1))
    return [(offsets[start], offsets[end]) for start, end in spans]


def render_punctuation_phraseweave(
    sentences: Sequence[str], spans: Sequence[Sequence[tuple[int, int]]], *, split_clauses: bool
) -> str:
    if len(sentences) != len(spans):
        raise ValueError("Practice span count does not match sentences.")
    return json.dumps({
        "schema_version": PUNCTUATION_SCHEMA_VERSION,
        "practice_sequence": (
            PUNCTUATION_CLAUSE_PRACTICE_SEQUENCE if split_clauses
            else PUNCTUATION_PRACTICE_SEQUENCE
        ),
        "statements": [{
            "english": sentence,
            "context_before": "",
            "context_after": "",
            "unit_id": f"{index}:whole",
            "source_unit_ids": [],
            "practice_spans": [list(span) for span in sentence_spans],
        } for index, (sentence, sentence_spans) in enumerate(zip(sentences, spans, strict=True))],
    }, ensure_ascii=False, indent=2) + "\n"


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


def render_lazy_markdown(sentences: Sequence[str]) -> str:
    lines = ["# 原句复现练习", ""]
    for index, sentence in enumerate(sentences, start=1):
        lines.extend([f"## 第 {index} 句", "", sentence, ""])
    return "\n".join(lines).rstrip() + "\n"


def render_lazy_phraseweave(sentences: Sequence[str]) -> str:
    return json.dumps({
        "schema_version": LAZY_SCHEMA_VERSION,
        "practice_sequence": LAZY_PRACTICE_SEQUENCE,
        "statements": [{
            "english": sentence,
            "context_before": "",
            "context_after": "",
            "unit_id": f"{index}:whole",
            "source_unit_ids": [],
        } for index, sentence in enumerate(sentences)],
    }, ensure_ascii=False, indent=2) + "\n"
