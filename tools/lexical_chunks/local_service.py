#!/usr/bin/env python3
"""Loopback API for the hosted PhraseWeave generator route; uses only stdlib."""

from __future__ import annotations

import errno
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import threading
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from model_runtime import CACHE_DIR, MODEL_FILES, SOURCE_MODEL_DIR, TRANSLATION_PROVIDERS

ROOT = Path(__file__).resolve().parents[2]
PROJECT_DIR = Path(__file__).resolve().parent
WORKER = PROJECT_DIR / "worker.py"
VENV_DIR = Path(os.environ.get("PHRASEWEAVE_RUNTIME_VENV", str(CACHE_DIR / "venv")))
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
MAX_LOCAL_DATA_BODY_BYTES = 50 * 1024 * 1024
DATA_DIR = Path(os.environ.get(
    "PHRASEWEAVE_DATA_DIR",
    str(Path.home() / "Library" / "Application Support" / "PhraseWeave"),
))
DATABASE_PATH = DATA_DIR / "phraseweave.sqlite3"
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
    parsed: dict[str, Any] | None = None
    last_output = ""
    with subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=PROJECT_DIR,
        env=UV_ENV,
    ) as process:
        process.stdin.write(json.dumps(payload, ensure_ascii=False))
        process.stdin.close()
        for line in process.stdout:
            last_output = (last_output + line)[-1200:]
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                if on_progress:
                    on_progress(line.strip()[-500:])
                continue
            if not isinstance(record, dict):
                continue
            if "progress" in record:
                if on_progress:
                    on_progress(record["progress"])
            else:
                parsed = record
        returncode = process.wait()
    if returncode != 0 or not parsed or not parsed.get("ok"):
        message = parsed.get("error") if parsed else last_output
        raise RuntimeError(message or "Local worker failed.")
    return parsed


def _generate(job_id: str, payload: dict[str, Any]) -> None:
    global ACTIVE_JOB
    try:
        result = _run_worker(
            {**payload, "action": "generate"},
            lambda message: _update_job(job_id, message=str(message)),
        )
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


@contextmanager
def _database():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(DATABASE_PATH, timeout=30)
    try:
        database.execute("PRAGMA busy_timeout = 30000")
        database.execute("PRAGMA journal_mode = WAL")
        database.execute(
            "CREATE TABLE IF NOT EXISTS course_packs (id TEXT PRIMARY KEY, data TEXT NOT NULL)"
        )
        database.execute(
            "CREATE TABLE IF NOT EXISTS course_pack_catalog (id TEXT PRIMARY KEY, data TEXT NOT NULL)"
        )
        yield database
        database.commit()
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()


def _route_id(route: str, prefix: str) -> str | None:
    if not route.startswith(prefix):
        return None
    tail = unquote(route[len(prefix):])
    if not tail or "/" in tail or len(tail) > 200:
        return None
    return tail


def _json_data(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _save_catalog_entry(database: sqlite3.Connection, item: Any) -> None:
    if not isinstance(item, dict) or not isinstance(item.get("id"), str):
        raise ValueError("Catalog entry is invalid.")
    database.execute(
        "INSERT INTO course_pack_catalog(id, data) VALUES(?, ?) "
        "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        (item["id"], _json_data(item)),
    )


def _save_course_pack(
    database: sqlite3.Connection, course_pack: dict[str, Any], *, merge_progress: bool = True,
) -> None:
    exercise_id = course_pack.get("id")
    if not isinstance(exercise_id, str) or not exercise_id:
        raise ValueError("Course pack is invalid.")
    existing = database.execute(
        "SELECT data FROM course_packs WHERE id = ?", (exercise_id,)
    ).fetchone()
    if existing and merge_progress:
        course_pack = _merge_progress(json.loads(existing[0]), course_pack)
    database.execute(
        "INSERT INTO course_packs(id, data) VALUES(?, ?) "
        "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        (exercise_id, _json_data(course_pack)),
    )
    _save_catalog_entry(database, {
        "id": exercise_id,
        "title": course_pack.get("title", ""),
        "description": course_pack.get("description", ""),
        "isFree": bool(course_pack.get("isFree", False)),
        "cover": course_pack.get("cover", ""),
    })


def _merge_progress(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = json.loads(_json_data(incoming))
    current_courses = {
        course.get("id"): course
        for course in current.get("courses", [])
        if isinstance(course, dict) and isinstance(course.get("id"), str)
    }
    for course in merged.get("courses", []):
        if not isinstance(course, dict):
            continue
        previous = current_courses.get(course.get("id"))
        if not previous:
            continue
        if previous.get("learningMode") in ("progressive", "sentence-first"):
            # Full-pack writes (e.g. completion) must not restore a stale mode or cursor.
            course["statementIndex"] = previous.get("statementIndex", 0)
            course["learningMode"] = previous["learningMode"]
            course.pop("sentenceFirstStartIndex", None)
            if "sentenceFirstStartIndex" in previous:
                course["sentenceFirstStartIndex"] = previous["sentenceFirstStartIndex"]
        else:
            course["statementIndex"] = max(
                int(course.get("statementIndex", 0) or 0),
                int(previous.get("statementIndex", 0) or 0),
            )
        course["completionCount"] = max(
            int(course.get("completionCount", 0) or 0),
            int(previous.get("completionCount", 0) or 0),
        )
        previous_units = previous.get("passedUnitIds", [])
        current_units = course.get("passedUnitIds", [])
        course["passedUnitIds"] = list(dict.fromkeys([
            *(previous_units if isinstance(previous_units, list) else []),
            *(current_units if isinstance(current_units, list) else []),
        ]))
    return merged


def _migrate_legacy_data(payload: dict[str, Any]) -> tuple[int, int]:
    course_packs = payload.get("coursePacks", [])
    catalog = payload.get("catalog", [])
    if not isinstance(course_packs, list) or not isinstance(catalog, list):
        raise ValueError("Legacy data is invalid.")
    imported_packs = 0
    imported_catalog = 0
    with _database() as database:
        for incoming in course_packs:
            if not isinstance(incoming, dict) or not isinstance(incoming.get("id"), str):
                continue
            _save_course_pack(database, incoming)
            imported_packs += 1
        for item in catalog:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                continue
            _save_catalog_entry(database, item)
            imported_catalog += 1
    return imported_packs, imported_catalog


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
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
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
        return (
            not DESKTOP_TOKEN
            or self.headers.get("Authorization", "") == f"Bearer {DESKTOP_TOKEN}"
            or self._valid_origin()
        )

    def _body(self, max_bytes: int = MAX_BODY_BYTES) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > max_bytes:
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
        if parsed.path == "/api/local-exercises":
            with _database() as database:
                rows = database.execute("SELECT data FROM course_packs ORDER BY rowid").fetchall()
            self._json({"items": [json.loads(row[0]) for row in rows]})
            return
        if parsed.path == "/api/local-exercise-catalog":
            with _database() as database:
                rows = database.execute("SELECT data FROM course_pack_catalog ORDER BY rowid").fetchall()
            self._json({"items": [json.loads(row[0]) for row in rows]})
            return
        exercise_id = _route_id(parsed.path, "/api/local-exercises/")
        if exercise_id:
            with _database() as database:
                row = database.execute(
                    "SELECT data FROM course_packs WHERE id = ?", (exercise_id,)
                ).fetchone()
            self._json({"item": json.loads(row[0]) if row else None})
            return
        if parsed.path == "/api/status":
            self._json({
                "runtimeReady": getattr(sys, "frozen", False) or PYTHON.is_file(),
                "modelDownloaded": all((SOURCE_MODEL_DIR / name).is_file() for name in MODEL_FILES),
                "translationProviders": list(TRANSLATION_PROVIDERS),
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
        exercise_id = _route_id(path, "/api/local-exercises/")
        if exercise_id:
            with _database() as database:
                database.execute("DELETE FROM course_packs WHERE id = ?", (exercise_id,))
                database.execute("DELETE FROM course_pack_catalog WHERE id = ?", (exercise_id,))
            self._json({"ok": True})
            return
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
        if urlparse(self.path).path == "/api/local-exercises/migrate":
            try:
                payload = self._body(MAX_LOCAL_DATA_BODY_BYTES)
                imported_packs, imported_catalog = _migrate_legacy_data(payload)
            except (ValueError, json.JSONDecodeError, sqlite3.Error) as error:
                self._json({"error": str(error)}, 400)
                return
            self._json({"importedPacks": imported_packs, "importedCatalog": imported_catalog})
            return
        if INITIALIZATION["state"] != "ready":
            self._json({"error": INITIALIZATION.get("error") or "Generator is initializing."}, 503)
            return
        if urlparse(self.path).path != "/api/generate":
            self.send_error(404)
            return
        try:
            payload = self._body()
            if payload.get("translationProvider", "local") not in TRANSLATION_PROVIDERS:
                raise ValueError("Choose a supported translation provider.")
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

    def do_PUT(self) -> None:
        if not self._desktop_authorized() or (not DESKTOP_TOKEN and not self._valid_origin()):
            self._json({"error": "Origin is not allowed."}, 403)
            return
        route = unquote(urlparse(self.path).path)
        try:
            payload = self._body(MAX_LOCAL_DATA_BODY_BYTES)
            if route == "/api/local-exercise-catalog":
                entries = payload.get("items")
                if not isinstance(entries, list):
                    raise ValueError("Catalog items must be an array.")
                with _database() as database:
                    for item in entries:
                        _save_catalog_entry(database, item)
                self._json({"ok": True})
                return

            prefix = "/api/local-exercises/"
            if not route.startswith(prefix):
                self.send_error(404)
                return
            tail = route[len(prefix):].split("/")
            exercise_id = tail[0]
            if not exercise_id or len(exercise_id) > 200:
                raise ValueError("Exercise id is invalid.")
            with _database() as database:
                database.execute("BEGIN IMMEDIATE")
                if len(tail) == 1:
                    course_pack = payload.get("coursePack")
                    if not isinstance(course_pack, dict) or course_pack.get("id") != exercise_id:
                        raise ValueError("Course pack id does not match the request.")
                    _save_course_pack(database, course_pack)
                elif len(tail) == 2 and tail[1] in {"progress", "passed-units"}:
                    row = database.execute(
                        "SELECT data FROM course_packs WHERE id = ?", (exercise_id,)
                    ).fetchone()
                    if not row:
                        self._json({"ok": True})
                        return
                    course_pack = json.loads(row[0])
                    course_id = payload.get("courseId")
                    course = next(
                        (item for item in course_pack.get("courses", []) if item.get("id") == course_id),
                        None,
                    )
                    if course is None:
                        self._json({"ok": True})
                        return
                    if tail[1] == "progress":
                        index = payload.get("statementIndex")
                        if not isinstance(index, int) or isinstance(index, bool) or index < 0:
                            raise ValueError("Statement index is invalid.")
                        course["statementIndex"] = index
                        if "learningMode" in payload:
                            mode = payload["learningMode"]
                            if mode not in ("progressive", "sentence-first"):
                                raise ValueError("Learning mode is invalid.")
                            start = payload.get("sentenceFirstStartIndex")
                            if start is not None and (
                                not isinstance(start, int) or isinstance(start, bool)
                                or start < 0 or start >= len(course.get("statements", []))
                            ):
                                raise ValueError("Sentence-first start index is invalid.")
                            if index >= len(course.get("statements", [])):
                                raise ValueError("Statement index is invalid.")
                            course["learningMode"] = mode
                            course.pop("sentenceFirstStartIndex", None)
                            if mode == "sentence-first" and start is not None:
                                course["sentenceFirstStartIndex"] = start
                    else:
                        unit_key = payload.get("unitKey")
                        if not isinstance(unit_key, str) or not unit_key:
                            raise ValueError("Unit key is invalid.")
                        passed = course.get("passedUnitIds", [])
                        course["passedUnitIds"] = list(dict.fromkeys([*passed, unit_key]))
                    # This transaction already read the latest pack; an explicit cursor may move back.
                    _save_course_pack(database, course_pack, merge_progress=False)
                else:
                    self.send_error(404)
                    return
            self._json({"ok": True})
        except (ValueError, json.JSONDecodeError, sqlite3.Error) as error:
            self._json({"error": str(error)}, 400)


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


def _set_initialization(state: str, message: str, error: str = "") -> None:
    global INITIALIZATION
    next_state = {"state": state, "message": message}
    if error:
        next_state["error"] = error
    INITIALIZATION = next_state
    print(message, flush=True)


def _initialize_in_background() -> None:
    try:
        _set_initialization("downloading", "Preparing the local Python environment…")
        _initialize_runtime()
        _set_initialization("ready", "Local generator is ready")
    except Exception as error:
        _set_initialization("error", "Local generator setup failed", str(error))


def run_desktop_service() -> None:
    if not DESKTOP_TOKEN:
        raise RuntimeError("Desktop service requires a session token.")
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as error:
        if error.errno != errno.EADDRINUSE or PORT == 0:
            raise
        print(f"Port {PORT} is already in use; desktop service will use a private port.", file=sys.stderr)
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
