import json
from unittest import TestCase
from unittest import main as unittest_main
from unittest.mock import Mock, patch
from worker import main

class TranslationTests(TestCase):
    def test_single_step_failure_does_not_emit_translation(self):
        with (
            patch("worker._read_request", return_value={
                "action": "translate", "text": "Text.",
                "translationProvider": "index-translate",
            }),
            patch("worker.translate_sentences", side_effect=RuntimeError("第 1 句翻译失败")) as translate,
            patch("worker._emit") as emit,
        ):
            self.assertEqual(main(), 1)
        self.assertEqual(translate.call_args.args[1], "index-translate")
        emit.assert_called_once_with({"ok": False, "error": "第 1 句翻译失败"})

    def test_contextual_translation_prompt_identifies_full_sentence_and_target(self):
        from model_runtime import translate_contextual_word
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read = Mock(return_value=json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": "银行"}}]}).encode())
        with patch("model_runtime.urllib.request.urlopen", return_value=response) as urlopen:
            self.assertEqual(translate_contextual_word("bank", "She went to the bank to deposit money."), "银行")
        prompt = json.loads(urlopen.call_args.args[0].data)["messages"][0]["content"]
        self.assertIn("She went to the bank to deposit money.", prompt)
        self.assertIn("bank", prompt)
        self.assertIn("不要翻译其他部分", prompt)

    def test_word_translation_uses_its_segment_context(self):
        with (
            patch("worker.translate_contextual_word", return_value="放") as translate,
            patch("worker._emit") as emit,
        ):
            from worker import _translate
            _translate({"text": "put", "context": "She put the book.",
                        "translationProvider": "index-translate"})
        translate.assert_called_once_with("put", "She put the book.", "index-translate")
        emit.assert_called_once_with({"ok": True, "chinese": "放"})


if __name__ == "__main__":
    unittest_main()
