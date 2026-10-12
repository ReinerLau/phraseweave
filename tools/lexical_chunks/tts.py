"""Persistent word and sentence audio, independent of the translation model runtime."""

from __future__ import annotations

import atexit
import base64
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

MODEL_ID = "hexgrad/Kokoro-82M"
MODEL_REVISION = "f3ff3571791e39611d31c381e3a41a3af07b4987"
VOICE = "af_heart"
RATE = 1.0
SETUP_TIMEOUT = 600
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


class KokoroRuntime:
    """Supervise one resident worker without importing ML dependencies in the server."""

    def __init__(self, python: Path, *, worker: Path | None = None,
                 setup_timeout: float = SETUP_TIMEOUT):
        self.python = python
        self.worker = worker or Path(__file__).with_name("tts_worker.py")
        self.setup_timeout = setup_timeout
        self.lock = threading.RLock()
        self.request_lock = threading.Lock()
        self.process = None
        self.pending = None
        self.timer = None
        self.closed = False
        self.state = {"state": "starting", "message": "正在准备朗读环境…"}
        atexit.register(self.close)

    def status(self) -> dict:
        with self.lock:
            return dict(self.state)

    def environment_failed(self) -> None:
        with self.lock:
            self.state = {"state": "error", "message": "朗读环境准备失败，请重启本机服务。"}

    def start(self) -> dict:
        with self.lock:
            if self.closed or (self.process and self.process.poll() is None):
                return dict(self.state)
            command = ([sys.executable, "--tts"] if getattr(sys, "frozen", False)
                       else [str(self.python), str(self.worker)])
            try:
                process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                           stderr=None, text=True, encoding="utf-8", bufsize=1)
            except OSError as error:
                print(f"[kokoro] Worker start failed: {type(error).__name__}", file=sys.stderr)
                self.state = {"state": "error", "message": "朗读环境尚未就绪，请重启本机服务。"}
                return dict(self.state)
            self.process = process
            self.state = {"state": "starting", "message": "正在启动本地朗读…"}
            self.timer = threading.Timer(self.setup_timeout, self._fail,
                                         args=(process, "朗读模型准备超时，请在声音设置中重试。"))
            self.timer.daemon = True
            self.timer.start()
            threading.Thread(target=self._read, args=(process,), daemon=True).start()
            return dict(self.state)

    def _fail(self, process, message: str) -> None:
        with self.lock:
            if process is not self.process or self.closed or self.state["state"] == "error":
                return
            self.state = {"state": "error", "message": message}
            if self.timer:
                self.timer.cancel()
            if self.pending and not self.pending.done():
                self.pending.set_exception(RuntimeError(message))
            if process.poll() is None:
                process.kill()

    def _read(self, process) -> None:
        try:
            for line in process.stdout:
                record = json.loads(line)
                with self.lock:
                    if process is not self.process or self.closed:
                        return
                    if self.state["state"] == "error":
                        return
                    if record.get("state") in ("downloading", "loading", "ready"):
                        self.state = {"state": record["state"], "message": record["message"]}
                        if record["state"] == "ready":
                            self.timer.cancel()
                    elif record.get("state") == "error":
                        self._fail(process, record["message"])
                    elif "audio" in record and self.pending and not self.pending.done():
                        audio = base64.b64decode(record["audio"], validate=True)
                        if not audio:
                            raise ValueError("Empty worker audio")
                        self.pending.set_result(audio)
            self._fail(process, "朗读进程已停止，请在声音设置中重试。")
        except Exception as error:
            print(f"[kokoro] Worker protocol failed: {type(error).__name__}", file=sys.stderr)
            self._fail(process, "朗读进程异常，请在声音设置中重试。")
        finally:
            process.wait()
            process.stdout.close()
            process.stdin.close()

    def synthesize(self, text: str, *, kind: str = "word") -> bytes:
        if not self.request_lock.acquire(blocking=False):
            raise RuntimeError("朗读服务繁忙，请稍后重试。")
        try:
            with self.lock:
                if self.state["state"] != "ready":
                    raise RuntimeError(self.state["message"])
                process = self.process
                future = Future()
                self.pending = future
                try:
                    process.stdin.write(json.dumps({"text": text}) + "\n")
                    process.stdin.flush()
                except (OSError, ValueError):
                    self._fail(process, "朗读进程已停止，请在声音设置中重试。")
            try:
                return future.result(timeout=SENTENCE_TIMEOUT if kind == "sentence" else TIMEOUT)
            except TimeoutError as error:
                self._fail(process, "朗读生成超时，请在声音设置中重试。")
                raise RuntimeError("朗读生成超时，请在声音设置中重试。") from error
        finally:
            with self.lock:
                self.pending = None
            self.request_lock.release()

    def close(self) -> None:
        with self.lock:
            if self.closed:
                return
            if self.process:
                self._fail(self.process, "朗读服务已停止。")
            self.closed = True
            process = self.process
        if process:
            process.wait()



class AudioCache:
    def __init__(self, directory: Path, generate: Callable[[str], bytes],
                 generate_sentence: Callable[[str], bytes] | None = None):
        self.directory = directory
        self.generate = generate
        self.generate_sentence = generate_sentence if generate_sentence is not None else generate
        self.lock = threading.Lock()
        self.epoch = 0
        self.pending: dict[tuple[int, str], Future[bytes]] = {}
        # Bound concurrent cache misses; the worker serializes local inference.
        self.slots = threading.BoundedSemaphore(2)

    def get(self, text: object, kind: str = "word") -> bytes:
        if kind not in ("word", "sentence"):
            raise ValueError("请选择单词或整句朗读。")
        word = normalize_sentence(text) if kind == "sentence" else normalize_word(text)
        timeout = SENTENCE_TIMEOUT if kind == "sentence" else TIMEOUT
        identity = [2, MODEL_ID, MODEL_REVISION, VOICE, RATE, kind, word]
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
