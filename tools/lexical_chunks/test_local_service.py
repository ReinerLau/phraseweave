import json
import sys
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from types import SimpleNamespace
from unittest import TestCase
from unittest import main as unittest_main
from unittest.mock import patch

import local_service
import model_runtime
from local_service import Handler, JOBS, JOBS_LOCK


class CompletedJobEndpointTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.server_thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    def test_completed_job_retains_contents_until_client_acknowledges_receipt(self):
        job_id = "memoryonlyjob"
        with JOBS_LOCK:
            JOBS[job_id] = {
                "id": job_id,
                "state": "complete",
                "result": {
                    "outputs": [
                        {"name": "learning-units.md", "content": "# Generated"},
                        {"name": "learning-units.json", "content": '{"statements": []}'},
                    ]
                },
            }

        connection = HTTPConnection("127.0.0.1", self.port)
        try:
            connection.request(
                "OPTIONS",
                f"/api/jobs/{job_id}",
                headers={
                    "Origin": "https://reinerlau.github.io",
                    "Access-Control-Request-Method": "DELETE",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            preflight = connection.getresponse()
            allowed_methods = preflight.getheader("Access-Control-Allow-Methods", "")
            preflight.read()
            self.assertEqual(preflight.status, 204)
            self.assertIn("DELETE", {method.strip() for method in allowed_methods.split(",")})

            connection.request("GET", f"/api/jobs/{job_id}")
            response = connection.getresponse()
            body = json.loads(response.read())
            self.assertEqual(response.status, 200)
            with JOBS_LOCK:
                self.assertIn(job_id, JOBS)

            connection.request(
                "DELETE",
                f"/api/jobs/{job_id}",
                headers={"Origin": "http://localhost:3000"},
            )
            acknowledgment = connection.getresponse()
            acknowledgment_body = json.loads(acknowledgment.read())
        finally:
            connection.close()

        self.assertEqual(body["result"]["outputs"][0]["content"], "# Generated")
        self.assertEqual(body["result"]["outputs"][1]["content"], '{"statements": []}')
        self.assertEqual(acknowledgment.status, 200)
        self.assertTrue(acknowledgment_body["ok"])
        with JOBS_LOCK:
            self.assertNotIn(job_id, JOBS)

    def test_status_advertises_both_translation_providers(self):
        connection = HTTPConnection("127.0.0.1", self.port)
        try:
            connection.request("GET", "/api/status")
            response = connection.getresponse()
            body = json.loads(response.read())
        finally:
            connection.close()
        self.assertEqual(response.status, 200)
        self.assertEqual(body["translationProviders"], ["local", "index-translate"])
        self.assertIsInstance(body["modelDownloaded"], bool)

    def test_unknown_provider_is_rejected_without_starting_a_job(self):
        connection = HTTPConnection("127.0.0.1", self.port)
        try:
            with patch("local_service.INITIALIZATION", {"state": "ready"}), patch("local_service._generate") as worker:
                connection.request(
                    "POST", "/api/generate",
                    body=json.dumps({"text": "Text.", "format": "both", "translationProvider": "unknown"}),
                    headers={"Origin": "http://localhost:3000", "Content-Type": "application/json"},
                )
                response = connection.getresponse()
                body = json.loads(response.read())
                worker.assert_not_called()
        finally:
            connection.close()
        self.assertEqual(response.status, 400)
        self.assertIn("supported translation provider", body["error"])


class ExerciseProgressEndpointTests(TestCase):
    def setUp(self):
        directory = Path(self.enterContext(TemporaryDirectory()))
        self.enterContext(patch("local_service.DATA_DIR", directory))
        self.enterContext(patch("local_service.DATABASE_PATH", directory / "test.sqlite3"))
        self.enterContext(patch("local_service.DESKTOP_TOKEN", ""))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.pack = {
            "id": "pack", "title": "练习", "courses": [{
                "id": "course", "statementIndex": 8, "completionCount": 0,
                "statements": [{"id": str(index)} for index in range(9)],
                "passedUnitIds": ["unit:old"],
            }],
        }
        self.assertEqual(self.request("PUT", "/api/local-exercises/pack", {"coursePack": self.pack})[0], 200)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method, path, payload=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        try:
            connection.request(
                method, path,
                body=json.dumps(payload) if payload is not None else None,
                headers={"Origin": "http://localhost:3000", "Content-Type": "application/json"},
            )
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def progress(self, index, mode, start=None):
        return self.request("PUT", "/api/local-exercises/pack/progress", {
            "courseId": "course", "statementIndex": index,
            "learningMode": mode, "sentenceFirstStartIndex": start,
        })

    def stored_course(self):
        status, body = self.request("GET", "/api/local-exercises/pack")
        self.assertEqual(status, 200)
        return body["item"]["courses"][0]

    def test_switch_and_restart_atomically_save_a_lower_cursor_and_mode(self):
        self.assertEqual(self.progress(3, "sentence-first", 3)[0], 200)
        self.assertEqual(self.stored_course()["statementIndex"], 3)
        self.assertEqual(self.stored_course()["learningMode"], "sentence-first")
        self.assertEqual(self.stored_course()["sentenceFirstStartIndex"], 3)
        self.assertEqual(self.progress(0, "progressive")[0], 200)
        course = self.stored_course()
        self.assertEqual(course["statementIndex"], 0)
        self.assertEqual(course["learningMode"], "progressive")
        self.assertNotIn("sentenceFirstStartIndex", course)
        self.assertEqual(course["passedUnitIds"], ["unit:old"])

    def test_stale_completion_and_passed_unit_writes_preserve_mode_and_cursor(self):
        self.progress(3, "sentence-first", 3)
        self.pack["courses"][0]["completionCount"] = 1
        self.request("PUT", "/api/local-exercises/pack", {"coursePack": self.pack})
        self.request("PUT", "/api/local-exercises/pack/passed-units", {
            "courseId": "course", "unitKey": "unit:new",
        })
        course = self.stored_course()
        self.assertEqual(course["statementIndex"], 3)
        self.assertEqual(course["learningMode"], "sentence-first")
        self.assertEqual(course["sentenceFirstStartIndex"], 3)
        self.assertEqual(course["completionCount"], 1)
        self.assertEqual(course["passedUnitIds"], ["unit:old", "unit:new"])

    def test_backup_export_contains_mode_and_starting_occurrence(self):
        self.progress(3, "sentence-first", 3)
        status, body = self.request("GET", "/api/local-exercises")
        self.assertEqual(status, 200)
        exported = body["items"][0]["courses"][0]
        self.assertEqual(exported["learningMode"], "sentence-first")
        self.assertEqual(exported["statementIndex"], 3)
        self.assertEqual(exported["sentenceFirstStartIndex"], 3)

    def test_invalid_state_is_rejected_without_changing_saved_progress(self):
        for index, mode, start in [
            (3, "unknown", None), (3, "sentence-first", -1),
            (3, "sentence-first", True), (3, "sentence-first", 9),
            (9, "progressive", None),
        ]:
            with self.subTest(index=index, mode=mode, start=start):
                self.assertEqual(self.progress(index, mode, start)[0], 400)
                self.assertEqual(self.stored_course()["statementIndex"], 8)
                self.assertNotIn("learningMode", self.stored_course())

    def test_legacy_progress_updates_can_still_move_back(self):
        status, _ = self.request("PUT", "/api/local-exercises/pack/progress", {
            "courseId": "course", "statementIndex": 2,
        })
        self.assertEqual(status, 200)
        self.assertEqual(self.stored_course()["statementIndex"], 2)

    def test_fulltext_state_survives_stale_writes_backup_and_restart(self):
        status, _ = self.request("PUT", "/api/local-exercises/pack/progress", {
            "courseId": "course", "statementIndex": 3, "learningMode": "sentence-first",
            "sentenceFirstStartIndex": 3, "practiceView": "fulltext",
        })
        self.assertEqual(status, 200)
        self.pack["courses"][0]["practiceView"] = "single"
        self.pack["courses"][0]["completionCount"] = 1
        self.request("PUT", "/api/local-exercises/pack", {"coursePack": self.pack})
        self.request("PUT", "/api/local-exercises/pack/passed-units", {
            "courseId": "course", "unitKey": "unit:new",
        })
        status, body = self.request("GET", "/api/local-exercises")
        self.assertEqual(status, 200)
        saved = body["items"][0]["courses"][0]
        self.assertEqual(saved["practiceView"], "fulltext")
        self.assertEqual(saved["statementIndex"], 3)
        self.assertEqual(saved["sentenceFirstStartIndex"], 3)
        self.assertEqual(saved["completionCount"], 1)
        self.assertEqual(saved["passedUnitIds"], ["unit:old", "unit:new"])
        # Existing clients that omit the view must preserve it.
        self.progress(0, "progressive")
        self.assertEqual(self.stored_course()["practiceView"], "fulltext")
        self.assertEqual(self.stored_course()["statementIndex"], 0)

    def test_invalid_practice_view_is_atomic(self):
        for view in ("unknown", None, True):
            with self.subTest(view=view):
                status, _ = self.request("PUT", "/api/local-exercises/pack/progress", {
                    "courseId": "course", "statementIndex": 0,
                    "learningMode": "progressive", "practiceView": view,
                })
                self.assertEqual(status, 400)
                saved = self.stored_course()
                self.assertEqual(saved["statementIndex"], 8)
                self.assertNotIn("learningMode", saved)
                self.assertNotIn("practiceView", saved)


class RuntimeStartupTests(TestCase):
    @patch("local_service._run_worker")
    @patch("local_service.subprocess.run")
    @patch("local_service.shutil.which", return_value="/usr/local/bin/uv")
    def test_startup_syncs_dependencies_without_downloading_model(self, _which, run, worker):
        run.return_value.returncode = 0
        events = []
        run.side_effect = lambda *args, **kwargs: events.append("dependencies") or SimpleNamespace(
            returncode=0
        )
        worker.side_effect = lambda *args, **kwargs: events.append("model") or {}

        local_service._initialize_runtime()

        self.assertEqual(events, ["dependencies"])
        self.assertIn("--locked", run.call_args.args[0])
        worker.assert_not_called()

    @patch("local_service.subprocess.run")
    @patch("local_service.shutil.which", return_value=None)
    def test_missing_uv_fails_before_installing_or_starting_service(self, _which, run):
        with self.assertRaisesRegex(RuntimeError, "uv is required"):
            local_service._initialize_runtime()

        run.assert_not_called()

    @patch("local_service._run_worker")
    @patch("local_service.subprocess.run")
    @patch("local_service.shutil.which", return_value="/usr/local/bin/uv")
    def test_dependency_install_failure_stops_before_model_download(self, _which, run, worker):
        run.return_value.returncode = 1

        with self.assertRaisesRegex(RuntimeError, "could not install"):
            local_service._initialize_runtime()

        worker.assert_not_called()


class ModelInstallTests(TestCase):
    def test_existing_model_cache_skips_download(self):
        with TemporaryDirectory() as temp_dir:
            cache_dir = Path(temp_dir)
            model_dir = cache_dir / "model"
            model_dir.mkdir()
            for name in model_runtime.MODEL_FILES:
                (model_dir / name).write_text("cached")

            with (
                patch("model_runtime.CACHE_DIR", cache_dir),
                patch("model_runtime.SOURCE_MODEL_DIR", model_dir),
                patch("huggingface_hub.snapshot_download") as download,
            ):
                model_runtime.install_model()

            download.assert_not_called()

    def test_missing_model_files_are_downloaded_on_demand(self):
        with TemporaryDirectory() as temp_dir:
            cache_dir = Path(temp_dir)
            model_dir = cache_dir / "model"

            def download_model(**kwargs):
                target = Path(kwargs["local_dir"])
                target.mkdir(parents=True, exist_ok=True)
                for name in model_runtime.MODEL_FILES:
                    (target / name).write_text("downloaded")

            with (
                patch("model_runtime.CACHE_DIR", cache_dir),
                patch("model_runtime.SOURCE_MODEL_DIR", model_dir),
                patch("huggingface_hub.snapshot_download", side_effect=download_model) as download,
            ):
                model_runtime.install_model()
                self.assertTrue(model_runtime.model_status()["model_downloaded"])

            download.assert_called_once()

    def test_incomplete_model_download_can_be_retried(self):
        with TemporaryDirectory() as temp_dir:
            cache_dir = Path(temp_dir)
            model_dir = cache_dir / "model"

            with (
                patch("model_runtime.CACHE_DIR", cache_dir),
                patch("model_runtime.SOURCE_MODEL_DIR", model_dir),
                patch("huggingface_hub.snapshot_download"),
            ):
                with self.assertRaisesRegex(RuntimeError, "download is incomplete"):
                    model_runtime.install_model()
                with patch("huggingface_hub.snapshot_download") as retry:
                    retry.side_effect = lambda **kwargs: [
                        (Path(kwargs["local_dir"]) / name).touch()
                        for name in model_runtime.MODEL_FILES
                    ]
                    model_dir.mkdir(parents=True)
                    model_runtime.install_model()
                self.assertTrue(model_runtime.model_status()["model_downloaded"])


class WorkerProgressTests(TestCase):
    def test_progress_is_delivered_before_the_worker_finishes(self):
        with TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            script = directory / "worker.py"
            done = directory / "done"
            script.write_text(
                "import json, sys, time\n"
                "json.loads(sys.stdin.read())\n"
                "print(json.dumps({'progress': 'Downloading model'}), flush=True)\n"
                "time.sleep(0.2)\n"
                "from pathlib import Path\n"
                f"Path({str(done)!r}).touch()\n"
                "print(json.dumps({'ok': True, 'outputs': []}), flush=True)\n"
            )
            messages = []

            def progress(message):
                self.assertFalse(done.exists())
                messages.append(message)

            with patch("local_service.PYTHON", Path(sys.executable)), patch("local_service.WORKER", script):
                result = local_service._run_worker({"action": "generate"}, progress)
            self.assertTrue(result["ok"])
            self.assertEqual(messages, ["Downloading model"])

    def test_generation_publishes_worker_progress_to_the_job(self):
        job_id = "downloadprogress"
        JOBS[job_id] = {"state": "running"}

        def worker(_payload, on_progress):
            on_progress("Downloading model")
            self.assertEqual(JOBS[job_id]["message"], "Downloading model")
            return {"ok": True, "outputs": []}

        try:
            with patch("local_service._run_worker", side_effect=worker):
                local_service._generate(job_id, {"text": "Text.", "format": "both"})
            self.assertEqual(JOBS[job_id]["state"], "complete")
        finally:
            JOBS.pop(job_id, None)


if __name__ == "__main__":
    unittest_main()
