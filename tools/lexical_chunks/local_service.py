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
ALLOWED_ORIGINS = {
    "https://reinerlau.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
MAX_BODY_BYTES = 120_000
JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()
ACTIVE_JOB: str | None = None


def _run_worker(payload: dict[str, Any], on_progress: Any = None) -> dict[str, Any]:
    if not PYTHON.is_file():
        raise RuntimeError("The local Python environment is missing. Restart the service to initialize it.")
    result = subprocess.run(
        [str(PYTHON), str(WORKER)],
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
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self._json({
                "runtimeReady": PYTHON.is_file(),
                "modelDownloaded": all((SOURCE_MODEL_DIR / name).is_file() for name in MODEL_FILES),
                "activeJob": ACTIVE_JOB,
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
        if not self._valid_origin():
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
        if not self._valid_origin():
            self._json({"error": "Origin is not allowed."}, 403)
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
        lambda message: print(message, flush=True),
    )


if __name__ == "__main__":
    try:
        _initialize_runtime()
    except Exception as error:
        print(f"Local service setup failed: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from error
    print(f"PhraseWeave generator service: http://{HOST}:{PORT}", flush=True)
    print("Keep this terminal open while using the /generator route.", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
