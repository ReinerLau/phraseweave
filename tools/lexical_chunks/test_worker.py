import json
from datetime import datetime, timezone
from unittest import TestCase
from unittest import main as unittest_main
from unittest.mock import patch

from worker import _build_outputs, _generate, main


class InMemoryOutputTests(TestCase):
    def setUp(self):
        self.created_at = datetime(2026, 9, 30, 6, 30, 12, 123456, tzinfo=timezone.utc)

    def test_both_exports_share_a_timestamped_name_and_include_content(self):
        outputs = _build_outputs("# Markdown", '{"schema_version":4}', "both", self.created_at)

        self.assertEqual(
            outputs,
            [
                {
                    "name": "text.review.learning-units-20260930T063012123456Z.md",
                    "content": "# Markdown",
                },
                {
                    "name": "text.review.learning-units-20260930T063012123456Z.json",
                    "content": '{"schema_version":4}',
                },
            ],
        )

    def test_review_markdown_export_only_contains_requested_format(self):
        outputs = _build_outputs("# Review", "unused", "markdown", self.created_at)

        self.assertEqual(
            outputs,
            [
                {
                    "name": "text.review.learning-units-20260930T063012123456Z.md",
                    "content": "# Review",
                }
            ],
        )

    def test_phraseweave_export_only_contains_requested_format(self):
        outputs = _build_outputs("unused", '{"schema_version":4}', "phraseweave", self.created_at)

        self.assertEqual(
            outputs,
            [
                {
                    "name": "text.review.learning-units-20260930T063012123456Z.json",
                    "content": '{"schema_version":4}',
                }
            ],
        )


class ReviewGenerationTests(TestCase):
    def test_generation_always_replays_sources_even_for_legacy_mode_fields(self):
        sentence = {
            "sentence": "The cat",
            "units": [
                {"text": "The", "span": {"start": 0, "end": 3}},
                {"text": "cat", "span": {"start": 4, "end": 7}},
                {"text": "The cat", "span": {"start": 0, "end": 7}},
            ],
        }
        trace = {
            "tree_tokens": [],
            "explanations": ["单词", "单词", "组合"],
            "sources": [None, None, [(0, 3), (4, 7)]],
        }
        for mode in (None, "standard", "review"):
            with (
                self.subTest(legacy_mode=mode),
                patch("worker.load_syntax_model"),
                patch("worker.generate_plan", return_value=({"sentences": [sentence]}, [trace])),
                patch("worker.translate_sentences", return_value=["猫"]) as translate,
                patch("worker.model_status", return_value={"model_downloaded": True}),
                patch("worker._emit") as emit,
            ):
                payload = {"text": "The cat", "format": "both"}
                if mode is not None:
                    payload["mode"] = mode
                _generate(payload)
                self.assertEqual(translate.call_args.args[1], "local")
                outputs = emit.call_args.args[0]["outputs"]
                markdown, phraseweave = outputs
                self.assertEqual(markdown["content"].count("| 复习 |"), 2)
                rows = json.loads(phraseweave["content"])["statements"]
                self.assertEqual([row["english"] for row in rows], ["The", "cat", "The", "cat", "The cat"])
                self.assertEqual(rows[0]["unit_id"], rows[2]["unit_id"])
                self.assertEqual(rows[-1]["source_unit_ids"], ["0:0", "0:1"])
                self.assertTrue(all(output["name"].startswith("text.review.learning-units-") for output in outputs))

    def test_invalid_provider_is_rejected_before_syntax_analysis(self):
        with patch("worker.load_syntax_model") as syntax:
            with self.assertRaisesRegex(ValueError, "supported translation provider"):
                _generate({"text": "Text.", "format": "both", "translationProvider": "unknown"})
        syntax.assert_not_called()

    def test_public_failure_does_not_emit_partial_exports(self):
        with (
            patch("worker._read_request", return_value={
                "action": "generate", "text": "Text.", "format": "both",
                "translationProvider": "index-translate",
            }),
            patch("worker.load_syntax_model"),
            patch("worker.generate_plan", return_value=({"sentences": [{"sentence": "Text."}]}, [])),
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
