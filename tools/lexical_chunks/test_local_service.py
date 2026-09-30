import json
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from threading import Thread
from unittest import TestCase
from unittest import main as unittest_main

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


if __name__ == "__main__":
    unittest_main()
