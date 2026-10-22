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
    def test_generation_exports_one_whole_statement_per_sentence(self):
        with (
            patch("worker.translate_sentences", return_value=["猫在睡觉。", "鸟在歌唱。"]) as translate,
            patch("worker.model_status", return_value={"model_downloaded": False}),
            patch("worker._emit") as emit,
        ):
            _generate({"text": "The cat sleeps. Birds sing!", "format": "both"})

        self.assertEqual(translate.call_args.args[0], ["The cat sleeps.", "Birds sing!"])
        markdown, phraseweave = emit.call_args.args[0]["outputs"]
        self.assertIn("中文提示：猫在睡觉。", markdown["content"])
        rows = json.loads(phraseweave["content"])["statements"]
        self.assertEqual([row["english"] for row in rows], ["The cat sleeps.", "Birds sing!"])
        self.assertEqual([row["unit_id"] for row in rows], ["0:0", "1:0"])
        self.assertTrue(all(row["source_unit_ids"] == [] for row in rows))
        self.assertTrue(all(row["context_before"] == row["context_after"] == "" for row in rows))

    def test_invalid_provider_is_rejected_before_sentence_split(self):
        with patch("worker.split_sentences") as split:
            with self.assertRaisesRegex(ValueError, "supported translation provider"):
                _generate({"text": "Text.", "format": "both", "translationProvider": "unknown"})
        split.assert_not_called()

    def test_public_failure_does_not_emit_partial_exports(self):
        with (
            patch("worker._read_request", return_value={
                "action": "generate", "text": "Text.", "format": "both",
                "translationProvider": "index-translate",
            }),
            patch("worker.translate_sentences", side_effect=RuntimeError("第 1 句翻译失败")) as translate,
            patch("worker.render_markdown") as markdown,
            patch("worker.render_phraseweave") as phraseweave,
            patch("worker._emit") as emit,
        ):
            self.assertEqual(main(), 1)
        self.assertEqual(translate.call_args.args[1], "index-translate")
        markdown.assert_not_called()
        phraseweave.assert_not_called()
        emit.assert_called_once_with({"ok": False, "error": "第 1 句翻译失败"})


if __name__ == "__main__":
    unittest_main()
