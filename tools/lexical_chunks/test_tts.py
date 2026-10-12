import contextlib
import io
import hashlib
import json
import time
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
import tts_worker
from tts import AudioCache, KokoroRuntime, normalize_sentence, normalize_word


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

    def test_sentence_cache_is_separate_and_survives_restart_and_clear(self):
        word = Mock(return_value=b"word")
        sentence = Mock(return_value=b"sentence")
        cache = AudioCache(self.directory, word, sentence)
        self.assertEqual(cache.get("hello"), b"word")
        self.assertEqual(cache.get("hello", "sentence"), b"sentence")
        self.assertEqual(cache.get("Hello,  world!\n", "sentence"), b"sentence")
        offline = Mock(side_effect=RuntimeError("offline"))
        restart = AudioCache(self.directory, offline)
        self.assertEqual(restart.get("Hello, world!", "sentence"), b"sentence")
        offline.assert_not_called()
        self.assertEqual(len(list(self.directory.glob("*.mp3"))), 3)
        restart.clear()
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_sentence_validation_preserves_punctuation_and_bounds_length(self):
        self.assertEqual(normalize_sentence("  I use a computer.\n Every day! "), "I use a computer. Every day!")
        for value in (None, 1, "", "...", "中文", "a" * 2001):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_sentence(value)
        self.assertEqual(len(normalize_sentence("a" * 2000)), 2000)
        with self.assertRaises(ValueError):
            AudioCache(self.directory, Mock()).get("hello", "invalid")

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

    def test_old_edge_audio_is_retained_but_not_reused(self):
        self.directory.mkdir()
        key = hashlib.sha256(json.dumps([1, "hello", "en-US-AriaNeural", "+0%"]).encode()).hexdigest()
        old = self.directory / f"{key}.mp3"
        old.write_bytes(b"old-edge")
        generate = Mock(return_value=b"kokoro")
        cache = AudioCache(self.directory, generate)
        self.assertEqual(cache.get("hello"), b"kokoro")
        generate.assert_called_once_with("hello")
        self.assertTrue(old.exists())
        cache.clear()
        self.assertEqual(list(self.directory.iterdir()), [])


class KokoroRuntimeTests(TestCase):
    def setUp(self):
        self.directory = Path(self.enterContext(TemporaryDirectory()))
        self.worker = self.directory / "worker.py"
        self.worker.write_text('''import sys, json, base64, time
from pathlib import Path
print(json.dumps({"state":"ready","message":"ready"}), flush=True)
for line in sys.stdin:
    text = json.loads(line)["text"]
    if text == "crash": sys.exit(1)
    if text == "slow":
        Path(__file__).with_suffix(".started").touch()
        time.sleep(1)
    if text == "invalid":
        print(json.dumps({"audio":"not-base64"}), flush=True)
    else:
        print(json.dumps({"audio":base64.b64encode(text.encode()).decode()}), flush=True)
''')
        self.runtime = KokoroRuntime(Path(sys.executable), worker=self.worker, setup_timeout=2)
        self.addCleanup(self.runtime.close)

    def wait_for(self, predicate):
        deadline = time.monotonic() + 3
        while not predicate():
            if time.monotonic() > deadline:
                self.fail(f"Worker did not reach expected state: {self.runtime.status()}")
            time.sleep(.01)

    def ready(self):
        self.runtime.start()
        self.wait_for(lambda: self.runtime.status()["state"] == "ready")

    def test_process_is_reused_and_repeated_starts_are_idempotent(self):
        with self.assertRaisesRegex(RuntimeError, "准备"):
            self.runtime.synthesize("hello")
        self.ready()
        process = self.runtime.process
        with ThreadPoolExecutor(4) as pool:
            list(pool.map(lambda _: self.runtime.start(), range(8)))
        self.assertIs(self.runtime.process, process)
        self.assertEqual(self.runtime.synthesize("hello"), b"hello")
        self.assertEqual(self.runtime.synthesize("don't"), b"don't")
        self.assertEqual(self.runtime.synthesize("Hello, world!", kind="sentence"), b"Hello, world!")
        self.assertIs(self.runtime.process, process)
        self.runtime.close()
        self.assertIsNotNone(process.poll())

    def test_initialization_failure_can_be_retried(self):
        self.worker.write_text('import json; print(json.dumps({"state":"error","message":"下载失败"}), flush=True)')
        self.runtime.start()
        self.wait_for(lambda: self.runtime.status()["state"] == "error")
        self.wait_for(lambda: self.runtime.process.poll() is not None)
        self.assertEqual(self.runtime.status()["message"], "下载失败")
        self.worker.write_text('import json,sys; print(json.dumps({"state":"ready","message":"ready"}),flush=True); sys.stdin.read()')
        self.ready()

    def test_setup_timeout_and_exit_or_invalid_audio_fail_without_hanging(self):
        self.ready()
        for text in ("crash", "invalid"):
            with self.assertRaisesRegex(RuntimeError, "朗读进程"):
                self.runtime.synthesize(text)
            self.wait_for(lambda: self.runtime.process.poll() is not None)
            self.ready()
        self.runtime.close()
        self.worker.write_text('import time; time.sleep(5)')
        other = KokoroRuntime(Path(sys.executable), worker=self.worker, setup_timeout=.05)
        self.addCleanup(other.close)
        other.start()
        self.wait_for(lambda: other.status()["state"] == "error")
        self.assertIn("准备超时", other.status()["message"])

    def test_busy_inference_and_timeout_recovery(self):
        self.ready()
        with ThreadPoolExecutor(1) as pool:
            first = pool.submit(self.runtime.synthesize, "slow")
            self.wait_for(lambda: self.worker.with_suffix(".started").exists())
            with self.assertRaisesRegex(RuntimeError, "繁忙"):
                self.runtime.synthesize("hello")
            self.assertEqual(first.result(2), b"slow")
        with patch("tts.TIMEOUT", .02):
            with self.assertRaisesRegex(RuntimeError, "生成超时"):
                self.runtime.synthesize("slow")
        self.wait_for(lambda: self.runtime.process.poll() is not None)
        self.assertIn("生成超时", self.runtime.status()["message"])
        self.ready()
        self.assertEqual(self.runtime.synthesize("recovered"), b"recovered")

    def test_sentence_uses_60_second_timeout(self):
        self.ready()
        with patch("tts.Future.result", autospec=True, return_value=b"audio") as result:
            self.assertEqual(self.runtime.synthesize("hello", kind="sentence"), b"audio")
            self.assertEqual(result.call_args.kwargs["timeout"], 60)


class WorkerErrorTests(TestCase):
    def test_download_and_loading_failures_keep_their_actual_stage(self):
        for error, message in ((tts_worker.ModelDownloadError("upstream 403"), "下载失败"),
                               (ImportError("missing dependency"), "加载失败")):
            output = io.StringIO()
            with patch("tts_worker.prepare", side_effect=error), \
                 contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(tts_worker.main(), 1)
            self.assertIn(message, json.loads(output.getvalue())["message"])
            self.assertNotIn("网络", json.loads(output.getvalue())["message"])

    def test_no_samples_cannot_be_encoded_as_successful_audio(self):
        # Use the installed encoder/torch, but a pipeline that yields no audio.
        with self.assertRaisesRegex(RuntimeError, "empty audio"):
            tts_worker.encode(lambda *args, **kwargs: iter(()), None, "hello")


class TtsEndpointTests(TestCase):
    def setUp(self):
        directory = Path(self.enterContext(TemporaryDirectory()))
        self.generate = Mock(return_value=b"\xff\xfb\x90\x00\x00\xffaudio")
        self.enterContext(patch("local_service.TTS_CACHE", AudioCache(directory / "tts", self.generate)))
        self.enterContext(patch("local_service.DESKTOP_TOKEN", ""))
        self.runtime = Mock()
        self.runtime.status.return_value = {"state": "downloading", "message": "正在下载朗读模型"}
        self.runtime.start.return_value = {"state": "starting", "message": "正在启动"}
        self.enterContext(patch("local_service.TTS_RUNTIME", self.runtime))
        self.enterContext(patch("local_service.INITIALIZATION", {"state": "starting"}))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), local_service.Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method="POST", text="hello", origin="http://localhost:3000", path="/api/tts", kind=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port)
        try:
            connection.request(method, path, body=json.dumps({"text": text, **({"kind": kind} if kind is not None else {})}) if method == "POST" else None,
                               headers={"Origin": origin, "Content-Type": "application/json"})
            response = connection.getresponse()
            return response.status, response.getheader("Content-Type"), response.read()
        finally:
            connection.close()

    def test_status_retry_and_environment_failure_are_independent_of_translation(self):
        status, _, body = self.request("GET", path="/api/tts/status")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["state"], "downloading")
        self.assertEqual(self.request(path="/api/tts/retry")[0], 503)
        self.runtime.start.assert_not_called()
        with patch("local_service.INITIALIZATION", {"state": "ready"}):
            self.assertEqual(self.request(path="/api/tts/retry", origin="https://example.com")[0], 403)
            self.assertEqual(self.request(path="/api/tts/retry")[0], 200)
        self.runtime.start.assert_called_once()

    def test_binary_audio_cache_and_clear_without_translation_initialization(self):
        status, content_type, body = self.request()
        self.assertEqual((status, content_type, body), (200, "audio/mpeg", self.generate.return_value))
        self.assertEqual(self.request()[0], 200)
        self.generate.assert_called_once()
        self.assertEqual(self.request("DELETE", path="/api/tts/cache")[0], 200)
        self.request()
        self.assertEqual(self.generate.call_count, 2)

    def test_sentence_request_accepts_punctuation_and_long_utf8_body(self):
        text = "I use a computer every day."
        self.assertEqual(self.request(text=text, kind="sentence")[0], 200)
        self.generate.assert_called_with(text)
        # Larger than the former 2 KiB body limit, but fewer than 2000 characters.
        text = "English " + "’" * 1500
        self.assertEqual(self.request(text=text, kind="sentence")[0], 200)
        self.assertEqual(self.request(text="a" * 2001, kind="sentence")[0], 400)
        self.assertEqual(self.request(kind="invalid")[0], 400)

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
