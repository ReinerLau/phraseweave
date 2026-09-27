#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "click",
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
#   "spacy==3.8.7",
# ]
# ///

import json
from copy import deepcopy
from unittest import TestCase
from unittest import main as unittest_main

from split_lexical_chunks import (
    ConfigurationError,
    _parse_annotations,
    _validate_plan,
    generate_plan,
    load_syntax_model,
    render_markdown,
    render_phraseweave,
    render_trace,
)


FIRST_SENTENCE = (
    "Researchers from Tulane University in the USA say any kind of light "
    "at bedtime could be bad for your heart"
)
FIRST_UNITS = """Tulane
the
USA
the USA
in
in the USA
University
Tulane University
University in the USA
Tulane University in the USA
from
from Tulane University in the USA
Researchers
Researchers from Tulane University in the USA
any
light
of
of light
bedtime
at
at bedtime
kind
any kind
kind of light
any kind of light
any kind of light at bedtime
could
your
heart
your heart
for
for your heart
bad
bad for your heart
be
could be
be bad for your heart
could be bad for your heart
any kind of light at bedtime could be bad for your heart
say
Researchers from Tulane University in the USA say
say any kind of light at bedtime could be bad for your heart
Researchers from Tulane University in the USA say any kind of light at bedtime could be bad for your heart""".splitlines()

SECOND_SENTENCE = "The young teacher gave her students a difficult problem after class."
SECOND_UNITS = """The
young
teacher
young teacher
The young teacher
her
students
her students
a
difficult
class
after
after class
problem
difficult problem
problem after class
difficult problem after class
a difficult problem after class
gave
The young teacher gave
gave her students
The young teacher gave her students
The young teacher gave her students a difficult problem after class""".splitlines()


class AdjacentSubtreeLearningUnitTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()

    def plan(self, text):
        return generate_plan(text, self.nlp)[0]

    def test_matches_manual_postorder_examples(self):
        for source, expected in ((FIRST_SENTENCE, FIRST_UNITS), (SECOND_SENTENCE, SECOND_UNITS)):
            with self.subTest(source=source):
                units = self.plan(source)["sentences"][0]["units"]
                self.assertEqual([unit["text"] for unit in units], expected)
                self.assertEqual(units[-1]["kind"], "sentence")
                self.assertEqual(sum(unit["kind"] == "sentence" for unit in units), 1)

    def test_all_word_tokens_appear_and_units_use_one_source_span(self):
        source = SECOND_SENTENCE
        units = self.plan(source)["sentences"][0]["units"]
        self.assertIn("The", [unit["text"] for unit in units])
        self.assertIn("a", [unit["text"] for unit in units])
        for unit in units:
            start, end = unit["span"]["start"], unit["span"]["end"]
            self.assertEqual(unit["text"], source[start:end])

    def test_internal_punctuation_blocks_local_closure_but_sentence_keeps_comma(self):
        plan, traces = generate_plan("He smiled, and she laughed.", self.nlp)
        texts = [unit["text"] for unit in plan["sentences"][0]["units"]]
        self.assertIn("He smiled", texts)
        self.assertIn("she laughed", texts)
        self.assertEqual(texts[-1], "He smiled, and she laughed")
        self.assertNotIn("smiled, and", texts)
        self.assertTrue(traces[0]["blocked"])

    def test_coordination_follows_tree_without_special_grouping(self):
        texts = [unit["text"] for unit in self.plan("He smiled and she laughed.")["sentences"][0]["units"]]
        self.assertIn("smiled and", texts)

    def test_multiple_sentences_keep_independent_units(self):
        plan = self.plan("Dogs bark. Cats sleep!")
        self.assertEqual(len(plan["sentences"]), 2)
        self.assertEqual([sentence["units"][-1]["text"] for sentence in plan["sentences"]], ["Dogs bark", "Cats sleep"])

    def test_rejects_old_and_tampered_plans(self):
        plan = self.plan("Dogs bark.")
        old = deepcopy(plan)
        old["schema_version"] = 2
        with self.assertRaisesRegex(ConfigurationError, "schema_version 3"):
            _validate_plan(old, self.nlp)

        wrong_version = deepcopy(plan)
        wrong_version["algorithm_version"] += 1
        with self.assertRaisesRegex(ConfigurationError, "generator versions"):
            _validate_plan(wrong_version, self.nlp)

        wrong_span = deepcopy(plan)
        wrong_span["sentences"][0]["units"][0]["span"]["start"] += 1
        with self.assertRaisesRegex(ConfigurationError, "does not match"):
            _validate_plan(wrong_span, self.nlp)

        wrong_order = deepcopy(plan)
        wrong_order["sentences"][0]["units"][:2] = reversed(wrong_order["sentences"][0]["units"][:2])
        with self.assertRaisesRegex(ConfigurationError, "do not match"):
            _validate_plan(wrong_order, self.nlp)

    def test_annotation_alignment_and_phraseweave_import_shape(self):
        plan = self.plan("Birdsong is good.")
        prompts = [f"提示 {index}" for index, _ in enumerate(plan["sentences"][0]["units"], 1)]
        annotations = {"schema_version": 1, "sentences": [{"unit_prompts": prompts}]}
        parsed = _parse_annotations(json.dumps(annotations), plan)
        payload = json.loads(render_phraseweave(plan, parsed))
        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(len(payload["statements"]), len(prompts))
        self.assertEqual(payload["statements"][-1]["english"], "Birdsong is good")
        self.assertEqual(set(payload["statements"][0]), {"chinese", "english", "soundmark"})

        annotations["sentences"][0]["unit_prompts"].pop()
        with self.assertRaisesRegex(ConfigurationError, "must contain exactly"):
            _parse_annotations(json.dumps(annotations), plan)

    def test_markdown_and_trace_show_composition_explanations(self):
        plan, traces = generate_plan("the USA grows.", self.nlp)
        prompts = {
            "schema_version": 1,
            "sentences": [{"unit_prompts": ["提示" for _ in plan["sentences"][0]["units"]]}],
        }
        markdown = render_markdown(plan, prompts, traces)
        report = render_trace(traces)
        self.assertIn("| 序号 | 中文提示 | 英文答案 | 组合说明 |", markdown)
        self.assertIn("中心词 USA；左接 the", markdown)
        self.assertIn("| 序号 | 学习单元 | 组合说明 |", report)
        self.assertIn("整句", report)


if __name__ == "__main__":
    unittest_main()
