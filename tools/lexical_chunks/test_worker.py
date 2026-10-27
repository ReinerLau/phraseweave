import json
from datetime import datetime, timezone
from unittest import TestCase
from unittest import main as unittest_main
from unittest.mock import patch

from worker import _build_outputs, _generate, main


class InMemoryOutputTests(TestCase):
    def test_both_exports_share_a_timestamped_name(self):
        created_at = datetime(2026, 9, 30, 6, 30, 12, 123456, tzinfo=timezone.utc)
        outputs = _build_outputs("# Markdown", '{"schema_version":4}', "both", created_at)
        self.assertEqual(
            [output["name"] for output in outputs],
            [
                "text.sentence-review-20260930T063012123456Z.md",
                "text.sentence-review-20260930T063012123456Z.json",
            ],
        )


class SentenceGenerationTests(TestCase):
    def test_generation_exports_one_whole_statement_per_sentence_without_commas(self):
        with (
            patch("worker.translate_sentences") as translate,
            patch("worker.model_status", return_value={"model_downloaded": False}),
            patch("worker._emit") as emit,
        ):
            _generate({"text": "The cat sleeps. Birds sing!", "format": "both"})

        translate.assert_not_called()
        markdown, phraseweave = emit.call_args.args[0]["outputs"]
        self.assertIn("The cat sleeps.", markdown["content"])
        self.assertNotIn("中文提示", markdown["content"])
        self.assertEqual(json.loads(phraseweave["content"])["schema_version"], 5)
        rows = json.loads(phraseweave["content"])["statements"]
        self.assertEqual([row["english"] for row in rows], ["The cat sleeps.", "Birds sing!"])
        self.assertEqual([row["unit_id"] for row in rows], ["0:whole", "1:whole"])
        self.assertTrue(all("sentence_chinese" not in row for row in rows))
        self.assertTrue(all(row["source_unit_ids"] == [] for row in rows))
        self.assertTrue(all(row["context_before"] == row["context_after"] == "" for row in rows))

    def test_generation_does_not_split_or_translate_comma_parts(self):
        source = "Read this, then write, and check. Birds sing!"
        with (
            patch("worker.translate_sentences") as translate,
            patch("worker._emit") as emit,
        ):
            _generate({"text": source, "format": "both"})
        translate.assert_not_called()
        outputs = emit.call_args.args[0]["outputs"]
        rows = json.loads(outputs[1]["content"])["statements"]
        self.assertEqual([row["english"] for row in rows],
                         ["Read this, then write, and check.", "Birds sing!"])
        self.assertEqual(len(rows), 2)

    def test_generation_ignores_translation_provider(self):
        with patch("worker.translate_sentences") as translate, patch("worker._emit"):
            _generate({"text": "Text.", "format": "both", "translationProvider": "unknown"})
        translate.assert_not_called()

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


if __name__ == "__main__":
    unittest_main()
