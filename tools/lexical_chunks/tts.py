"""Persistent word and sentence audio, independent of the translation model runtime."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import unicodedata
from concurrent.futures import Future
from pathlib import Path
from typing import Callable

VOICE = "en-US-AriaNeural"
RATE = "+0%"
TIMEOUT = 20
MAX_WORD_LENGTH = 100
MAX_SENTENCE_LENGTH = 2000
SENTENCE_TIMEOUT = 60


def normalize_word(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("请选择一个英文单词。")
    word = unicodedata.normalize("NFC", value.strip()).replace("’", "'").replace("‘", "'")
    if len(word) > MAX_WORD_LENGTH or not re.fullmatch(r"[A-Za-z]+(?:'[A-Za-z]+)*", word):
        raise ValueError("请选择一个不超过 100 字符的英文单词。")
    return word


def normalize_sentence(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("请选择一个英文句子。")
    text = " ".join(unicodedata.normalize("NFC", value).split())
    if not text or len(text) > MAX_SENTENCE_LENGTH or not re.search(r"[A-Za-z]", text):
        raise ValueError("请选择一个不超过 2000 字符的英文句子。")
    return text


def synthesize(word: str, python: Path, *, kind: str = "word") -> bytes:
    command = (
        [sys.executable, "--tts"]
        if getattr(sys, "frozen", False)
        else [str(python), str(Path(__file__).with_name("tts_worker.py"))]
    )
    try:
        result = subprocess.run(
            command,
            input=json.dumps({"text": word, "voice": VOICE, "rate": RATE}).encode(),
            capture_output=True,
            timeout=SENTENCE_TIMEOUT if kind == "sentence" else TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("朗读生成超时，请重试。") from error
    except OSError as error:
        raise RuntimeError("朗读环境尚未就绪，请启动或重启本机服务。") from error
    if result.returncode or not result.stdout:
        raise RuntimeError("朗读生成失败，请检查网络后重试。")
    return result.stdout


class AudioCache:
    def __init__(self, directory: Path, generate: Callable[[str], bytes],
                 generate_sentence: Callable[[str], bytes] | None = None):
        self.directory = directory
        self.generate = generate
        self.generate_sentence = generate_sentence if generate_sentence is not None else generate
        self.lock = threading.Lock()
        self.epoch = 0
        self.pending: dict[tuple[int, str], Future[bytes]] = {}
        # Bound simultaneous upstream requests; cached audio never takes a slot.
        self.slots = threading.BoundedSemaphore(2)

    def get(self, text: object, kind: str = "word") -> bytes:
        if kind not in ("word", "sentence"):
            raise ValueError("请选择单词或整句朗读。")
        word = normalize_sentence(text) if kind == "sentence" else normalize_word(text)
        timeout = SENTENCE_TIMEOUT if kind == "sentence" else TIMEOUT
        # Preserve persisted word keys from the first release.
        identity = [1, word, VOICE, RATE] if kind == "word" else [1, kind, word, VOICE, RATE]
        key = hashlib.sha256(json.dumps(identity).encode()).hexdigest()
        with self.lock:
            path = self.directory / f"{key}.mp3"
            if path.is_file():
                audio = path.read_bytes()
                if audio:
                    return audio
            flight = (self.epoch, key)
            future = self.pending.get(flight)
            owner = future is None
            if owner:
                future = Future()
                self.pending[flight] = future
        if not owner:
            return future.result(timeout=timeout + 1)
        try:
            if not self.slots.acquire(blocking=False):
                raise RuntimeError("朗读服务繁忙，请稍后重试。")
            try:
                audio = self.generate_sentence(word) if kind == "sentence" else self.generate(word)
                if not audio:
                    raise RuntimeError("没有收到朗读音频，请重试。")
            finally:
                self.slots.release()
            with self.lock:
                # A clear invalidates every generation that started before it.
                if flight[0] == self.epoch:
                    self.directory.mkdir(parents=True, exist_ok=True)
                    temporary = path.with_suffix(".tmp")
                    try:
                        temporary.write_bytes(audio)
                        os.replace(temporary, path)
                    finally:
                        temporary.unlink(missing_ok=True)
            future.set_result(audio)
            return audio
        except Exception as error:
            future.set_exception(error)
            raise
        finally:
            with self.lock:
                self.pending.pop(flight, None)

    def clear(self) -> None:
        with self.lock:
            self.epoch += 1
            if self.directory.exists():
                for path in self.directory.iterdir():
                    if path.suffix in {".mp3", ".tmp"} and path.is_file():
                        path.unlink()
