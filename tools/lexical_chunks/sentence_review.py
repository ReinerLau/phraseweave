"""Split source text into sentences and export sentence-only practice."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence

SCHEMA_VERSION = 4
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


def render_markdown(sentences: Sequence[str], chinese: Sequence[str]) -> str:
    lines = ["# 整句逐词复现", ""]
    for index, (sentence, prompt) in enumerate(zip(sentences, chinese, strict=True), start=1):
        lines.extend([f"## 第 {index} 句", "", f"中文提示：{prompt}", "", sentence, ""])
    return "\n".join(lines).rstrip() + "\n"


def render_phraseweave(sentences: Sequence[str], chinese: Sequence[str]) -> str:
    statements = [
        {
            "english": sentence,
            "context_before": "",
            "context_after": "",
            "sentence_chinese": prompt,
            "unit_id": f"{index}:0",
            "source_unit_ids": [],
        }
        for index, (sentence, prompt) in enumerate(zip(sentences, chinese, strict=True))
    ]
    return (
        json.dumps(
            {"schema_version": SCHEMA_VERSION, "statements": statements},
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
