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
    _exercise_steps,
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
FIRST_UNITS = """the
USA
the USA
in
in the USA
Tulane
University
Tulane University
University in the USA
Tulane University in the USA
from
from Tulane University in the USA
Researchers
Researchers from Tulane University in the USA
light
of
of light
bedtime
at
at bedtime
any
kind
any kind
kind of light
any kind of light
any kind of light at bedtime
your
heart
your heart
for
for your heart
bad
bad for your heart
could
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
class
after
after class
a
difficult
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

    def test_leaf_child_follows_non_leaf_siblings_before_head(self):
        texts = [unit["text"] for unit in self.plan(FIRST_SENTENCE + ".")["sentences"][0]["units"]]
        index = texts.index("bad for your heart")
        self.assertEqual(texts[index:index + 4], ["bad for your heart", "could", "be", "could be"])

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

    def test_review_replays_both_direct_sources_in_example_order(self):
        plan, traces = generate_plan(FIRST_SENTENCE + ".", self.nlp)
        sentence = plan["sentences"][0]
        steps = _exercise_steps(sentence, traces[0], "review")
        rows = [(sentence["units"][index]["text"], is_review) for index, is_review in steps]

        for result, sources in (
            ("the USA", ["the", "USA"]),
            ("University in the USA", ["University", "in the USA"]),
            ("any kind of light at bedtime", ["at bedtime", "any kind of light"]),
            ("any kind of light at bedtime could be bad for your heart",
             ["any kind of light at bedtime", "could be bad for your heart"]),
            ("Researchers from Tulane University in the USA say",
             ["Researchers from Tulane University in the USA", "say"]),
        ):
            with self.subTest(result=result):
                position = rows.index((result, False))
                self.assertEqual(rows[position - 2:position], [(text, True) for text in sources])

        for first, second in zip(steps, steps[1:]):
            self.assertFalse(first[1] and second[1] and first[0] == second[0])
        self.assertEqual(
            [index for index, is_review in steps if not is_review],
            list(range(len(sentence["units"]))),
        )

    def test_review_renderers_reuse_prompts_and_phraseweave_schema(self):
        plan, traces = generate_plan("the USA grows.", self.nlp)
        sentence = plan["sentences"][0]
        prompts = [f"提示 {index}" for index, _ in enumerate(sentence["units"], 1)]
        translations = {"sentences": [{"unit_prompts": prompts}]}
        steps = _exercise_steps(sentence, traces[0], "review")

        markdown = render_markdown(plan, translations, traces, mode="review")
        self.assertEqual(markdown.count("| 复习 |"), sum(is_review for _, is_review in steps))
        payload = json.loads(render_phraseweave(plan, translations, traces, mode="review"))
        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["statements"], [
            {"chinese": prompts[index], "english": sentence["units"][index]["text"], "soundmark": ""}
            for index, _ in steps
        ])
        self.assertEqual(
            len(json.loads(render_phraseweave(plan, translations))["statements"]),
            len(sentence["units"]),
        )

    def test_review_does_not_invent_sources_across_punctuation(self):
        plan, traces = generate_plan("He smiled, and she laughed.", self.nlp)
        sentence = plan["sentences"][0]
        self.assertIsNone(traces[0]["sources"][-1])
        self.assertEqual(_exercise_steps(sentence, traces[0], "review")[-1], (len(sentence["units"]) - 1, False))


if __name__ == "__main__":
    unittest_main()
