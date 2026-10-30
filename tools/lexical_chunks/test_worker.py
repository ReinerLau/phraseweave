import json
from datetime import datetime, timezone
from unittest import TestCase
from unittest import main as unittest_main
from unittest.mock import Mock, patch

from split_lexical_chunks import load_syntax_model
from worker import _build_outputs, _generate, main


class InMemoryOutputTests(TestCase):
    def test_json_export_has_a_timestamped_name(self):
        created_at = datetime(2026, 9, 30, 6, 30, 12, 123456, tzinfo=timezone.utc)
        outputs = _build_outputs('{"schema_version":4}', created_at)
        self.assertEqual(
            [output["name"] for output in outputs],
            ["text.sentence-review-20260930T063012123456Z.json"],
        )


class SentenceGenerationTests(TestCase):
    def test_default_generation_saves_syntax_children_and_parents_in_preview_order(self):
        sentence = "time marched on, indifferent to my concerns; and soon enough another month had passed."
        with patch("worker._emit") as emit:
            _generate({"text": sentence})
        result = emit.call_args.args[0]
        saved = json.loads(result["outputs"][0]["content"])
        steps = saved["statements"][0]["practice_steps"]
        segment_texts = [sentence.encode("utf-16-le")[step["span"][0] * 2:step["span"][1] * 2]
                         .decode("utf-16-le") for step in steps if step["kind"] in {"segment", "sentence"}]
        self.assertEqual(segment_texts, [
            "time", "marched on", "time marched on", "indifferent to my concerns",
            "and soon enough", "another month", "had passed.",
            "another month had passed.", "and soon enough another month had passed.", sentence,
        ])
        self.assertEqual([label for label in result["preview"][0]["steps"]
                          if label.startswith(("组合片段：", "整句："))],
                         [f"组合片段：{text}" for text in segment_texts[:-1]] + [f"整句：{sentence}"])

    def test_target_sentence_drills_each_leaf_before_replaying_the_whole(self):
        sentence = "The Magic Armor Mark One was now complete."
        with patch("worker._emit") as emit:
            _generate({"text": sentence})
        result = emit.call_args.args[0]
        self.assertEqual(result["preview"][0]["steps"], [
            "实义词：Magic", "实义词：Armor", "实义词：Mark", "实义词：One",
            "功能词填空：___ Magic Armor Mark One",
            "组合片段：The Magic Armor Mark One",
            "实义词：now", "实义词：complete",
            "功能词填空：___ now complete.", "组合片段：was now complete.",
            f"整句：{sentence}",
        ])
        saved = json.loads(result["outputs"][0]["content"])
        self.assertEqual(saved["schema_version"], 8)
        self.assertEqual(saved["practice_sequence"], "lazy-content-function-v1")
        self.assertEqual(saved["statements"][0]["practice_steps"][-1],
                         {"kind": "sentence", "span": [0, len(sentence)]})

    def test_each_original_sentence_is_parsed_once_for_both_kinds_of_questions(self):
        parse = Mock(wraps=load_syntax_model())
        with (
            patch("worker.load_syntax_model", return_value=parse),
            patch("worker._emit"),
        ):
            _generate({"text": "Birds sing. In the morning she left."})
        self.assertEqual([call.args for call in parse.call_args_list], [
            ("Birds sing.",), ("In the morning she left.",),
        ])

    def test_clause_option_is_unavailable_for_new_generation(self):
        with patch("worker.load_syntax_model") as model:
            with self.assertRaisesRegex(ValueError, "Clause splitting is temporarily unavailable"):
                _generate({"text": "I think that she is right.", "splitClauses": True})
        model.assert_not_called()

    def test_generation_exports_one_whole_statement_per_sentence_without_commas(self):
        with (
            patch("worker.translate_sentences") as translate,
            patch("worker.load_syntax_model") as syntax_model,
            patch("worker.model_status", return_value={"model_downloaded": False}),
            patch("worker._emit") as emit,
        ):
            _generate({"text": "The cat sleeps. Birds sing!"})

        translate.assert_not_called()
        syntax_model.assert_called_once()
        outputs = emit.call_args.args[0]["outputs"]
        self.assertEqual(len(outputs), 1)
        self.assertTrue(outputs[0]["name"].endswith(".json"))
        generated = json.loads(outputs[0]["content"])
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
            _generate({"text": source})
        translate.assert_not_called()
        outputs = emit.call_args.args[0]["outputs"]
        rows = json.loads(outputs[0]["content"])["statements"]
        self.assertEqual([row["english"] for row in rows],
                         ["Read this, then write, and check.", "Birds sing!"])
        self.assertEqual(len(rows), 2)

    def test_default_preview_matches_saved_punctuation_steps(self):
        with patch("worker._emit") as emit:
            _generate({"text": "A, B; C: D—E."})
        result = emit.call_args.args[0]
        self.assertEqual(result["preview"][0]["steps"][-1], "整句：A, B; C: D—E.")
        saved = json.loads(result["outputs"][0]["content"])
        self.assertEqual(saved["statements"][0]["practice_steps"][-1],
                         {"kind": "sentence", "span": [0, 13]})

    def test_generation_ignores_translation_provider(self):
        with patch("worker.translate_sentences") as translate, patch("worker._emit"):
            _generate({"text": "Text.", "translationProvider": "unknown"})
        translate.assert_not_called()

    def test_markdown_formats_are_rejected(self):
        for output_format in ("markdown", "both"):
            with self.subTest(output_format=output_format):
                with patch("worker.load_syntax_model") as model:
                    with self.assertRaisesRegex(ValueError, "Unsupported output format"):
                        _generate({"text": "Text.", "format": output_format})
                model.assert_not_called()

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
