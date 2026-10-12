import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event, Thread
from unittest import TestCase, main
from unittest.mock import Mock, patch

import local_service
from tts import AudioCache, normalize_word, synthesize


class AudioCacheTests(TestCase):
    def setUp(self):
        self.directory = Path(self.enterContext(TemporaryDirectory())) / "tts"

    def test_restart_reuses_persisted_audio_without_network(self):
        generate = Mock(return_value=b"mp3")
        AudioCache(self.directory, generate).get("don’t")
        offline = Mock(side_effect=RuntimeError("offline"))
        self.assertEqual(AudioCache(self.directory, offline).get("don't"), b"mp3")
        offline.assert_not_called()
        self.assertEqual(len(list(self.directory.glob("*.mp3"))), 1)

    def test_case_is_preserved_for_acronyms(self):
        generate = Mock(return_value=b"mp3")
        cache = AudioCache(self.directory, generate)
        cache.get("US")
        cache.get("us")
        self.assertEqual(generate.call_count, 2)

    def test_failed_or_empty_generation_can_be_retried(self):
        generate = Mock(side_effect=[RuntimeError("offline"), b"", b"mp3"])
        cache = AudioCache(self.directory, generate)
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                cache.get("hello")
            self.assertFalse(self.directory.exists())
        self.assertEqual(cache.get("hello"), b"mp3")

    def test_concurrent_requests_share_one_generation(self):
        started, release = Event(), Event()
        def generate(_word):
            started.set()
            self.assertTrue(release.wait(2))
            return b"mp3"
        cache = AudioCache(self.directory, Mock(side_effect=generate))
        with ThreadPoolExecutor(2) as pool:
            first = pool.submit(cache.get, "hello")
            self.assertTrue(started.wait(2))
            # Ensure the second request has joined the existing future.
            future = next(iter(cache.pending.values()))
            waiting = Event()
            original = future.result
            def result(*args, **kwargs):
                waiting.set()
                return original(*args, **kwargs)
            with patch.object(future, "result", side_effect=result):
                second = pool.submit(cache.get, "hello")
                self.assertTrue(waiting.wait(2))
                release.set()
                self.assertEqual(first.result(2), b"mp3")
                self.assertEqual(second.result(2), b"mp3")
        cache.generate.assert_called_once()

    def test_clear_does_not_allow_old_generation_to_repopulate_cache(self):
        started, release = Event(), Event()
        def generate(_word):
            started.set()
            self.assertTrue(release.wait(2))
            return b"old"
        cache = AudioCache(self.directory, generate)
        with ThreadPoolExecutor(1) as pool:
            first = pool.submit(cache.get, "hello")
            self.assertTrue(started.wait(2))
            cache.clear()
            cache.generate = Mock(return_value=b"new")
            self.assertEqual(cache.get("hello"), b"new")
            release.set()
            self.assertEqual(first.result(2), b"old")
        self.assertEqual(cache.get("hello"), b"new")
        cache.clear()
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_busy_service_does_not_create_failed_cache_entries(self):
        cache = AudioCache(self.directory, Mock(return_value=b"mp3"))
        cache.slots.acquire()
        cache.slots.acquire()
        with self.assertRaisesRegex(RuntimeError, "繁忙"):
            cache.get("hello")
        cache.slots.release()
        cache.slots.release()
        self.assertEqual(cache.get("hello"), b"mp3")

    def test_words_only_and_bounded_length(self):
        for value in (None, 1, "", "...", "hello world", "hello/../", "a" * 101, "中文", "$500"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_word(value)
        self.assertEqual(normalize_word("  NASA  "), "NASA")
        self.assertEqual(normalize_word("don’t"), "don't")

    def test_worker_timeout_and_failure_are_not_audio(self):
        with patch("tts.subprocess.run", side_effect=subprocess.TimeoutExpired("tts", 20)) as run:
            with self.assertRaisesRegex(RuntimeError, "超时"):
                synthesize("hello", Path(sys.executable))
            self.assertEqual(run.call_args.kwargs["timeout"], 20)
        with patch("tts.subprocess.run", return_value=Mock(returncode=1, stdout=b"partial")):
            with self.assertRaisesRegex(RuntimeError, "失败"):
                synthesize("hello", Path(sys.executable))


class TtsEndpointTests(TestCase):
    def setUp(self):
        directory = Path(self.enterContext(TemporaryDirectory()))
        self.generate = Mock(return_value=b"\xff\xfb\x90\x00\x00\xffaudio")
        self.enterContext(patch("local_service.TTS_CACHE", AudioCache(directory / "tts", self.generate)))
        self.enterContext(patch("local_service.DESKTOP_TOKEN", ""))
        self.enterContext(patch("local_service.INITIALIZATION", {"state": "starting"}))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), local_service.Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method="POST", text="hello", origin="http://localhost:3000", path="/api/tts"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        try:
            connection.request(method, path, body=json.dumps({"text": text}) if method == "POST" else None,
                               headers={"Origin": origin, "Content-Type": "application/json"})
            response = connection.getresponse()
            return response.status, response.getheader("Content-Type"), response.read()
        finally:
            connection.close()

    def test_binary_audio_cache_and_clear_without_translation_initialization(self):
        status, content_type, body = self.request()
        self.assertEqual((status, content_type, body), (200, "audio/mpeg", self.generate.return_value))
        self.assertEqual(self.request()[0], 200)
        self.generate.assert_called_once()
        self.assertEqual(self.request("DELETE", path="/api/tts/cache")[0], 200)
        self.request()
        self.assertEqual(self.generate.call_count, 2)

    def test_invalid_input_upstream_failure_and_untrusted_origin(self):
        self.assertEqual(self.request(text="two words")[0], 400)
        self.assertEqual(self.request(origin="https://example.com")[0], 403)
        self.assertEqual(self.request("DELETE", origin="https://example.com", path="/api/tts/cache")[0], 403)
        self.generate.assert_not_called()
        self.generate.side_effect = RuntimeError("offline")
        status, content_type, body = self.request()
        self.assertEqual(status, 503)
        self.assertIn("application/json", content_type)
        self.assertEqual(json.loads(body)["error"], "offline")


if __name__ == "__main__":
    main()
