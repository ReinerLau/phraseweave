"""Parse Skill output without generating or translating learning content."""
from __future__ import annotations

from datetime import datetime
import uuid

SEQUENCE = "bilingual-chain-v1"


def parse_chain(text: str) -> list[dict[str, str]]:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("第 1 行缺少英文条目。")
    lines = text.removeprefix("\ufeff").splitlines()
    offset = 0
    if lines[0].strip() in ("```text", "```"):
        if lines[-1].strip() != "```":
            raise ValueError("代码块缺少结束围栏。")
        lines = lines[1:-1]
        offset = 1
    for index, line in enumerate(lines):
        if not line.strip():
            raise ValueError(f"第 {index + offset + 1} 行为空。")
    if len(lines) % 2:
        raise ValueError(f"第 {len(lines) + offset} 行英文缺少下一行中文。")
    if not lines:
        raise ValueError("练习链为空。")
    return [{"english": lines[i], "chinese": lines[i + 1]} for i in range(0, len(lines), 2)]


def build_pack(entries: list[dict[str, str]], title: str) -> dict:
    pack_id, course_id = uuid.uuid4().hex, uuid.uuid4().hex
    title = title.strip() or datetime.now().astimezone().strftime("练习 %Y-%m-%d %H:%M:%S")
    statements = []
    for index, entry in enumerate(entries):
        identifier = uuid.uuid4().hex
        statements.append({
            "id": identifier, "unitId": identifier, "order": index + 1,
            "english": entry["english"], "sentenceChinese": entry["chinese"],
            "contextBefore": "", "contextAfter": "", "sourceUnitIds": [],
        })
    return {
        "id": pack_id, "title": title, "description": "", "isFree": True, "cover": "",
        "courses": [{
            "id": course_id, "coursePackId": pack_id, "title": title, "order": 1,
            "completionCount": 0, "statementIndex": 0, "resumeStatementIndex": 0,
            "practiceSequence": SEQUENCE, "practiceView": "single",
            "learningMode": "sentence-first", "passedUnitIds": [], "statements": statements,
        }],
    }
