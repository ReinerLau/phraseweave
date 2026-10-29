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
    def test_default_generation_saves_fronted_parts_and_parent_in_preview_order(self):
        sentence = "time marched on, indifferent to my concerns; and soon enough another month had passed."
        with patch("worker._emit") as emit:
            _generate({"text": sentence, "format": "phraseweave"})
        result = emit.call_args.args[0]
        saved = json.loads(result["outputs"][0]["content"])
        steps = saved["statements"][0]["practice_steps"]
        segment_texts = [sentence.encode("utf-16-le")[step["span"][0] * 2:step["span"][1] * 2]
                         .decode("utf-16-le") for step in steps if step["kind"] in {"segment", "sentence"}]
        self.assertEqual(segment_texts, [
            "time marched on", "indifferent to my concerns", "and soon enough",
            "another month had passed.", "and soon enough another month had passed.", sentence,
        ])
        self.assertEqual([label for label in result["preview"][0]["steps"]
                          if label.startswith(("组合片段：", "整句："))],
                         [f"组合片段：{text}" for text in segment_texts[:-1]] + [f"整句：{sentence}"])

    def test_opt_in_clause_mode_does_not_use_fronted_adjunct_split(self):
        sentence = "time marched on, indifferent to my concerns; and soon enough another month had passed."
        with patch("worker._emit") as emit:
            _generate({"text": sentence, "format": "phraseweave", "splitClauses": True})
        saved = json.loads(emit.call_args.args[0]["outputs"][0]["content"])
        steps = saved["statements"][0]["practice_steps"]
        segment_texts = [sentence.encode("utf-16-le")[step["span"][0] * 2:step["span"][1] * 2]
                         .decode("utf-16-le") for step in steps if step["kind"] in {"segment", "sentence"}]
        self.assertEqual(segment_texts, [
            "time marched on", "indifferent to my concerns",
            "and soon enough another month had passed.", sentence,
        ])

    def test_opt_in_clause_generation_exports_preview_even_for_markdown_only(self):
        with (
            patch("worker.load_syntax_model") as model,
            patch("worker.punctuation_clause_practice_spans", return_value=[(0, 7), (8, 25), (0, 26)]) as spans,
            patch("worker._emit") as emit,
        ):
            _generate({"text": "I think that she is right.", "format": "markdown", "splitClauses": True})
        model.assert_called_once()
        spans.assert_called_once()
        result = emit.call_args.args[0]
        self.assertEqual(len(result["outputs"]), 1)
        self.assertEqual(result["preview"][0]["steps"], [
            "组合片段：I think", "组合片段：that she is right", "整句：I think that she is right.",
        ])

    def test_opt_in_clause_parser_failure_is_reported(self):
        with (
            patch("worker.load_syntax_model", return_value=object()),
            patch("worker.punctuation_clause_practice_spans", side_effect=ValueError("bad parse")),
        ):
            with self.assertRaisesRegex(RuntimeError, "Clause parsing failed for sentence 1: bad parse"):
                _generate({"text": "I think that she is right.", "format": "both", "splitClauses": True})

    def test_generation_exports_one_whole_statement_per_sentence_without_commas(self):
        with (
            patch("worker.translate_sentences") as translate,
            patch("worker.load_syntax_model") as syntax_model,
            patch("worker.model_status", return_value={"model_downloaded": False}),
            patch("worker._emit") as emit,
        ):
            _generate({"text": "The cat sleeps. Birds sing!", "format": "both"})

        translate.assert_not_called()
        syntax_model.assert_called_once()
        markdown, phraseweave = emit.call_args.args[0]["outputs"]
        self.assertIn("The cat sleeps.", markdown["content"])
        self.assertNotIn("中文提示", markdown["content"])
        generated = json.loads(phraseweave["content"])
        self.assertEqual(generated["schema_version"], 8)
        self.assertEqual(generated["practice_sequence"], "lazy-content-function-v1")
        rows = generated["statements"]
        self.assertEqual([row["english"] for row in rows], ["The cat sleeps.", "Birds sing!"])
        self.assertEqual([row["unit_id"] for row in rows], ["0:whole", "1:whole"])
        self.assertTrue(all("sentence_chinese" not in row for row in rows))
        self.assertTrue(all(row["source_unit_ids"] == [] for row in rows))
        self.assertTrue(all(row["context_before"] == row["context_after"] == "" for row in rows))
        self.assertEqual([row["practice_steps"][-1]["span"] for row in rows], [[0, 15], [0, 11]])
        self.assertEqual(emit.call_args.args[0]["preview"][0]["steps"][-1], "整句：The cat sleeps.")

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

    def test_default_preview_matches_saved_punctuation_steps(self):
        with patch("worker._emit") as emit:
            _generate({"text": "A, B; C: D—E.", "format": "both"})
        result = emit.call_args.args[0]
        self.assertEqual(result["preview"][0]["steps"][-1], "整句：A, B; C: D—E.")
        saved = json.loads(result["outputs"][1]["content"])
        self.assertEqual(saved["statements"][0]["practice_steps"][-1],
                         {"kind": "sentence", "span": [0, 13]})

    def test_opt_in_clause_export_uses_new_version(self):
        with (
            patch("worker.load_syntax_model", return_value=lambda text: []),
            patch("worker.punctuation_clause_practice_spans", return_value=[(0, 7), (8, 25), (0, 26)]),
            patch("worker._emit") as emit,
        ):
            _generate({"text": "I think that she is right.", "format": "phraseweave", "splitClauses": True})
        saved = json.loads(emit.call_args.args[0]["outputs"][0]["content"])
        self.assertEqual(saved["schema_version"], 8)
        self.assertEqual(saved["practice_sequence"], "lazy-content-function-clause-v1")

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
