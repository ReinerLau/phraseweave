import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from unittest import TestCase, skipUnless
from unittest.mock import patch

import model_runtime
from model_runtime import model_status, translate_sentences


SOURCE = (
    "The loud music from other passengers on public transport has become a peeve "
    "for many people who want to travel in quiet"
)


@skipUnless(model_status()["model_downloaded"], "Hy-MT2 model is not cached")
class TranslationRegressionTests(TestCase):
    def test_peeve_and_quiet_are_translated_in_context(self):
        chinese = translate_sentences([SOURCE])[0]

        self.assertIn("安静", chinese)
        self.assertTrue(any(word in chinese for word in ("不满", "烦恼", "困扰")))
        self.assertNotIn("隐秘", chinese)


class PublicTranslationTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.requests = []
        cls.responses = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                cls.requests.append((self.path, dict(self.headers), json.loads(body)))
                status, content = cls.responses.pop(0)
                encoded = content.encode() if isinstance(content, str) else json.dumps(content).encode()
                self.send_response(status)
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/v1/chat/completions"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.requests.clear()
        self.responses.clear()
        self.endpoint = patch("model_runtime.INDEX_TRANSLATE_URL", self.url)
        self.endpoint.start()
        self.addCleanup(self.endpoint.stop)

    def response(self, text, finish_reason="stop"):
        return {"choices": [{"finish_reason": finish_reason, "message": {"content": text}}]}

    def test_sequential_requests_preserve_order_without_local_model(self):
        self.responses.extend([(200, self.response(" 第一条译文。 ")), (200, self.response("第二条译文。"))])
        with (
            patch("model_runtime.install_model") as install,
            patch("model_runtime._load_tokenizer") as tokenizer,
            patch("model_runtime._translate_transformers") as local,
        ):
            result = translate_sentences(["First sentence.", "Second sentence."], "index-translate")
        self.assertEqual(result, ["第一条译文。", "第二条译文。"])
        install.assert_not_called()
        tokenizer.assert_not_called()
        local.assert_not_called()
        for index, (path, headers, payload) in enumerate(self.requests):
            self.assertEqual(path, "/v1/chat/completions")
            self.assertEqual(headers["User-Agent"], "Index-Translate-Client/1.0")
            self.assertEqual(headers["Content-Type"], "application/json")
            self.assertNotIn("Authorization", headers)
            self.assertEqual(payload["model"], "Index-Translate-35B-A3B")
            self.assertEqual(payload["temperature"], 0)
            self.assertEqual(payload["max_tokens"], 512)
            self.assertFalse(payload["stream"])
            self.assertEqual(payload["chat_template_kwargs"], {"enable_thinking": False})
            self.assertIn(["First sentence.", "Second sentence."][index], payload["messages"][0]["content"])

    def test_http_errors_report_sentence_and_never_retry_or_fall_back(self):
        for status in (412, 429, 500, 503):
            with self.subTest(status=status), patch("model_runtime.install_model") as install:
                self.requests.clear()
                self.responses.extend([(200, self.response("成功。")), (status, "<html>blocked</html>")])
                with self.assertRaisesRegex(RuntimeError, f"第 2 句.*HTTP {status}"):
                    translate_sentences(["One.", "Two.", "Three."], "index-translate")
                self.assertEqual(len(self.requests), 2)
                install.assert_not_called()

    def test_invalid_or_incomplete_responses_fail(self):
        for result in (
            "not JSON", [], {}, {"choices": []}, {"choices": [None]},
            {"choices": [{"finish_reason": "stop", "message": []}]},
            self.response(None), self.response("  "), self.response("截断", "length"),
            self.response("推理", "content_filter"), self.response("<think>reason</think>译文"),
        ):
            with self.subTest(result=result):
                self.responses.append((200, result))
                with self.assertRaisesRegex(RuntimeError, "第 1 句翻译失败"):
                    translate_sentences(["Text."], "index-translate")

    def test_timeout_and_network_error_have_sentence_context(self):
        from urllib.error import URLError

        for error, message in ((TimeoutError(), "请求超时"), (URLError("offline"), "无法连接")):
            with self.subTest(error=error), patch("model_runtime.urllib.request.urlopen", side_effect=error) as request:
                with self.assertRaisesRegex(RuntimeError, f"第 1 句.*{message}"):
                    translate_sentences(["Text."], "index-translate")
                self.assertEqual(request.call_args.kwargs["timeout"], 30)
                request.assert_called_once()


class LocalTranslationDispatchTests(TestCase):
    def test_default_provider_installs_model_before_loading_and_translating(self):
        calls = []
        with (
            patch("model_runtime.install_model", side_effect=lambda progress: calls.append("install")),
            patch("model_runtime._load_tokenizer", side_effect=lambda: calls.append("tokenizer") or object()),
            patch("model_runtime._prepare_sentences"),
            patch("model_runtime._translate_transformers", return_value=["本地译文"]) as local,
        ):
            self.assertEqual(translate_sentences(["Local text."]), ["本地译文"])
        self.assertEqual(calls, ["install", "tokenizer"])
        local.assert_called_once()

    def test_invalid_provider_is_rejected_before_model_or_network_access(self):
        with patch("model_runtime.install_model") as install, patch("model_runtime.urllib.request.urlopen") as request:
            with self.assertRaisesRegex(ValueError, "supported translation provider"):
                translate_sentences(["Text."], "unknown")
        install.assert_not_called()
        request.assert_not_called()
