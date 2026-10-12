"""Build the offline IPA lexicon from pinned, vendored sources; no network required."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = Path(__file__).with_name("sources")
OUTPUT = ROOT / "apps/client/assets/pronunciation/english-us.json"

PHONES = {
    "AA": "ɑː", "AE": "æ", "AH": "ʌ", "AO": "ɔː", "AW": "aʊ",
    "AY": "aɪ", "EH": "ɛ", "ER": "ɜːr", "EY": "eɪ", "IH": "ɪ",
    "IY": "iː", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "uː",
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ",
    "HH": "h", "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n",
    "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t",
    "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}


def load_sources():
    manifest = json.loads((SOURCES / "manifest.json").read_text())
    for filename, source in manifest.items():
        if hashlib.sha256((SOURCES / filename).read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"Pinned source checksum mismatch: {filename}")
    spec = importlib.util.spec_from_file_location("pinned_syllabify", SOURCES / "syllabify.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.syllabify


def phone_to_ipa(phone: str) -> str:
    if phone == "AH0":
        return "ə"
    if phone == "ER0":
        return "ər"
    return PHONES[re.sub(r"[012]$", "", phone)]


def pronunciation_to_ipa(phones: list[str], syllabify) -> list[str]:
    syllables = syllabify(phones)
    flattened = [p for syllable in syllables for part in syllable for p in part]
    if flattened != phones or not syllables:
        raise ValueError("Syllabification lost phonemes")
    result = []
    for onset, nucleus, coda in syllables:
        stress = ""
        if len(syllables) > 1:
            if any(p.endswith("1") for p in nucleus):
                stress = "ˈ"
            elif any(p.endswith("2") for p in nucleus):
                stress = "ˌ"
        result.append(stress + "".join(phone_to_ipa(p) for p in onset + nucleus + coda))
    return result


def build_dictionary():
    syllabify = load_sources()
    entries, seen, rejected = {}, set(), []
    for line in (SOURCES / "cmudict.dict").read_text().splitlines():
        fields = line.split("#", 1)[0].split()
        if not fields or fields[0].startswith(";;;"):
            continue
        word = re.sub(r"\(\d+\)$", "", fields[0]).lower()
        if word in seen:
            continue
        seen.add(word)  # Never substitute a later pronunciation if the first fails.
        if not re.fullmatch(r"[a-z]+(?:'[a-z]+)*", word):
            continue
        try:
            entries[word] = pronunciation_to_ipa(fields[1:], syllabify)
        except (KeyError, ValueError, IndexError):
            rejected.append(word)
    return entries, rejected


if __name__ == "__main__":
    entries, rejected = build_dictionary()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + "\n")
    # Ship the complete upstream notices with the static client too.
    notices = (SOURCES / "CMUdict-LICENSE").read_text() + "\n\n"
    notices += "\n".join((SOURCES / "syllabify.py").read_text().splitlines()[1:23]) + "\n"
    (ROOT / "apps/client/public/pronunciation-LICENSE.txt").write_text(notices)
    print(f"Offline IPA dictionary: {len(entries)} words, {OUTPUT.stat().st_size} bytes; rejected {rejected}")
