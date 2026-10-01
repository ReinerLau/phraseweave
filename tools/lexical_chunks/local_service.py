#!/usr/bin/env python3
"""Loopback API for the hosted PhraseWeave generator route; uses only stdlib."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from model_runtime import CACHE_DIR, MODEL_FILES, SOURCE_MODEL_DIR

ROOT = Path(__file__).resolve().parents[2]
PROJECT_DIR = Path(__file__).resolve().parent
WORKER = PROJECT_DIR / "worker.py"
VENV_DIR = CACHE_DIR / "venv"
UV_ENV = {**os.environ, "UV_PROJECT_ENVIRONMENT": str(VENV_DIR)}
PYTHON = VENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
HOST = "127.0.0.1"
PORT = int(os.environ.get("PHRASEWEAVE_GENERATOR_PORT", "8765"))
DESKTOP_TOKEN = os.environ.get("PHRASEWEAVE_DESKTOP_TOKEN", "")
ALLOWED_ORIGINS = {
    "https://reinerlau.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
MAX_BODY_BYTES = 120_000
JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()
ACTIVE_JOB: str | None = None
INITIALIZATION: dict[str, str] = {"state": "starting", "message": "Starting local generator"}


def _run_worker(payload: dict[str, Any], on_progress: Any = None) -> dict[str, Any]:
    if not getattr(sys, "frozen", False) and not PYTHON.is_file():
        raise RuntimeError("The local Python environment is missing. Restart the service to initialize it.")
    command = (
        [sys.executable, "--worker"]
        if getattr(sys, "frozen", False)
        else [str(PYTHON), str(WORKER)]
    )
    result = subprocess.run(
        command,
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=PROJECT_DIR,
        env=UV_ENV,
        check=False,
    )
    parsed: dict[str, Any] | None = None
    for line in result.stdout.splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            if on_progress:
                on_progress(line[-500:])
            continue
        if "progress" in record:
            if on_progress:
                on_progress(record["progress"])
        else:
            parsed = record
    if result.returncode != 0 or not parsed or not parsed.get("ok"):
        message = parsed.get("error") if parsed else result.stdout[-1200:]
        raise RuntimeError(message or "Local worker failed.")
    return parsed


def _generate(job_id: str, payload: dict[str, Any]) -> None:
    global ACTIVE_JOB
    try:
        result = _run_worker({"action": "generate", **payload})
        _finish_job(job_id, result)
    except Exception as error:
        _finish_job(job_id, error=str(error))
    finally:
        ACTIVE_JOB = None


def _update_job(job_id: str, **changes: Any) -> None:
    with JOBS_LOCK:
        if job_id in JOBS:
            JOBS[job_id].update(changes)


def _finish_job(job_id: str, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        if error:
            job.update({"state": "failed", "error": error})
        else:
            job.update({"state": "complete", "result": result})


class Handler(BaseHTTPRequestHandler):
    server_version = "PhraseWeaveGenerator/1"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}", file=sys.stderr)

    def _cors(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Vary", "Origin")

    def _json(self, value: dict[str, Any], status: int = 200) -> None:
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _valid_origin(self) -> bool:
        return self.headers.get("Origin", "") in ALLOWED_ORIGINS

    def _desktop_authorized(self) -> bool:
        return not DESKTOP_TOKEN or self.headers.get("Authorization", "") == f"Bearer {DESKTOP_TOKEN}"

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("Request body is missing or too large.")
        if self.headers.get_content_type() != "application/json":
            raise ValueError("Request must use application/json.")
        value = json.loads(self.rfile.read(length))
        if not isinstance(value, dict):
            raise ValueError("Request body must be a JSON object.")
        return value

    def do_OPTIONS(self) -> None:
        if not self._valid_origin():
            self.send_error(403)
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if not self._desktop_authorized():
            self._json({"error": "Unauthorized."}, 403)
            return
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self._json({
                "runtimeReady": getattr(sys, "frozen", False) or PYTHON.is_file(),
                "modelDownloaded": all((SOURCE_MODEL_DIR / name).is_file() for name in MODEL_FILES),
                "activeJob": ACTIVE_JOB,
                "initialization": INITIALIZATION,
            })
            return
        if parsed.path.startswith("/api/jobs/"):
            job_id = parsed.path.removeprefix("/api/jobs/")
            with JOBS_LOCK:
                job = dict(JOBS.get(job_id, {}))
            if not job:
                self._json({"error": "Job not found."}, 404)
            else:
                self._json(job)
            return
        self.send_error(404)

    def do_DELETE(self) -> None:
        if not self._desktop_authorized() or (not DESKTOP_TOKEN and not self._valid_origin()):
            self._json({"error": "Origin is not allowed."}, 403)
            return
        path = urlparse(self.path).path
        prefix = "/api/jobs/"
        if not path.startswith(prefix):
            self.send_error(404)
            return
        job_id = path.removeprefix(prefix)
        if not job_id.isalnum():
            self.send_error(404)
            return
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if not job:
                self._json({"error": "Job not found."}, 404)
                return
            if job.get("state") not in {"complete", "failed"}:
                self._json({"error": "Job is still running."}, 409)
                return
            JOBS.pop(job_id, None)
        self._json({"ok": True})

    def do_POST(self) -> None:
        global ACTIVE_JOB
        if not self._desktop_authorized() or (not DESKTOP_TOKEN and not self._valid_origin()):
            self._json({"error": "Origin is not allowed."}, 403)
            return
        if INITIALIZATION["state"] != "ready":
            self._json({"error": INITIALIZATION.get("error") or "Generator is initializing."}, 503)
            return
        if urlparse(self.path).path != "/api/generate":
            self.send_error(404)
            return
        try:
            payload = self._body()
        except (ValueError, json.JSONDecodeError) as error:
            self._json({"error": str(error)}, 400)
            return
        with JOBS_LOCK:
            if ACTIVE_JOB:
                self._json({"error": "Another local generation task is already running."}, 409)
                return
            for previous_id, previous_job in tuple(JOBS.items()):
                if previous_job.get("state") in {"complete", "failed"}:
                    JOBS.pop(previous_id, None)
            job_id = uuid.uuid4().hex
            ACTIVE_JOB = job_id
            JOBS[job_id] = {"id": job_id, "state": "running", "message": "Starting"}
        thread = threading.Thread(target=_generate, args=(job_id, payload), daemon=True)
        thread.start()
        self._json({"id": job_id}, 202)


def _initialize_runtime() -> None:
    if not getattr(sys, "frozen", False):
        uv = shutil.which("uv")
        if not uv:
            raise RuntimeError("uv is required. Install uv, then restart the local service.")

        print("Installing or updating the local Python environment…", flush=True)
        result = subprocess.run(
            [uv, "sync", "--project", str(PROJECT_DIR), "--locked", "--python", "3.13", "--no-install-project"],
            cwd=ROOT,
            env=UV_ENV,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("uv could not install the locked Python dependencies.")

    print("Checking the Helsinki translation model…", flush=True)
    _run_worker(
        {"action": "install-model"},
        lambda message: _set_initialization("downloading", str(message)),
    )


def _set_initialization(state: str, message: str, error: str = "") -> None:
    global INITIALIZATION
    next_state = {"state": state, "message": message}
    if error:
        next_state["error"] = error
    INITIALIZATION = next_state
    print(message, flush=True)


def _initialize_in_background() -> None:
    try:
        _set_initialization("downloading", "Checking the translation model…")
        _initialize_runtime()
        _set_initialization("ready", "Local generator is ready")
    except Exception as error:
        _set_initialization("error", "Local generator setup failed", str(error))


def run_desktop_service() -> None:
    if not DESKTOP_TOKEN:
        raise RuntimeError("Desktop service requires a session token.")
    server = ThreadingHTTPServer((HOST, 0), Handler)
    print(json.dumps({"type": "ready", "port": server.server_port}), flush=True)
    threading.Thread(target=_initialize_in_background, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    try:
        _initialize_runtime()
    except Exception as error:
        print(f"Local service setup failed: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from error
    _set_initialization("ready", "Local generator is ready")
    print(f"PhraseWeave generator service: http://{HOST}:{PORT}", flush=True)
    print("Keep this terminal open while using the /generator route.", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
