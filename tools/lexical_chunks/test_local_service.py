import json
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


class RuntimeStartupTests(TestCase):
    @patch("local_service._run_worker")
    @patch("local_service.subprocess.run")
    @patch("local_service.shutil.which", return_value="/usr/local/bin/uv")
    def test_dependencies_are_synced_before_model_install(self, _which, run, worker):
        run.return_value.returncode = 0
        events = []
        run.side_effect = lambda *args, **kwargs: events.append("dependencies") or SimpleNamespace(
            returncode=0
        )
        worker.side_effect = lambda *args, **kwargs: events.append("model") or {}

        local_service._initialize_runtime()

        self.assertEqual(events, ["dependencies", "model"])
        self.assertIn("--locked", run.call_args.args[0])
        worker.assert_called_once()
        self.assertEqual(worker.call_args.args[0], {"action": "install-model"})

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

    def test_missing_model_files_are_downloaded_on_startup(self):
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

    def test_incomplete_model_download_fails_startup(self):
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


if __name__ == "__main__":
    unittest_main()
