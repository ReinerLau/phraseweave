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
from unittest import TestCase
from unittest import main as unittest_main

from split_lexical_chunks import (
    ConfigurationError,
    DEFAULT_RULES,
    _parse_annotations,
    _validate_plan,
    generate_plan,
    load_rules,
    load_syntax_model,
    render_markdown,
    render_phraseweave,
    render_trace,
)


class DependencyLearningUnitTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()
        cls.rules, cls.rules_digest = load_rules(DEFAULT_RULES)

    def plan(self, sentence):
        return generate_plan(sentence, self.nlp, self.rules, self.rules_digest)[0]

    def units(self, sentence):
        return self.plan(sentence)["sentences"][0]["units"]

    def test_places_existing_subunits_before_composites(self):
        self.assertEqual(
            [unit["text"] for unit in self.units("the USA.")],
            ["USA", "the USA", "the USA."],
        )

        sentence = (
            "Researchers from Tulane University in the USA say any kind of light "
            "at bedtime could be bad for your heart."
        )
        units = self.units(sentence)
        tokens = [token for token in self.nlp(sentence) if not token.is_punct and not token.is_space]

        def selected_tokens(unit):
            return {
                token.i
                for token in tokens
                if any(
                    segment["start"] <= token.idx
                    and token.idx + len(token.text) <= segment["end"]
                    for segment in unit["segments"]
                )
            }

        selected = [selected_tokens(unit) for unit in units[:-1]]
        for earlier_index, earlier in enumerate(selected):
            for later_index, later in enumerate(selected):
                if later < earlier:
                    self.assertLess(
                        later_index,
                        earlier_index,
                        f"{units[later_index]['text']} must precede {units[earlier_index]['text']}",
                    )
        self.assertEqual(units[-1]["kind"], "sentence")

    def test_rejects_plan_with_previous_unit_order(self):
        plan = self.plan("the USA.")
        plan["sentences"][0]["units"][:2] = list(reversed(plan["sentences"][0]["units"][:2]))

        with self.assertRaisesRegex(ConfigurationError, "do not match"):
            _validate_plan(plan, self.nlp, self.rules, self.rules_digest)

    def test_builds_dependency_phrases_without_lexical_core_metadata(self):
        units = self.units("Birdsong is good for our mental health.")
        texts = [unit["text"] for unit in units]

        self.assertIn("Birdsong", texts)
        self.assertIn("mental health", texts)
        self.assertNotIn("good for our mental health", texts)
        self.assertEqual(units[-1]["kind"], "sentence")
        self.assertNotIn("core", {key for unit in units for key in unit})

    def test_does_not_combine_sibling_branches(self):
        texts = [
            unit["text"]
            for unit in self.units("more green spaces and lower speed limits.")
        ]

        self.assertIn("green spaces", texts)
        self.assertIn("speed limits", texts)
        self.assertNotIn("more green spaces", texts)
        self.assertNotIn("spaces and lower speed limits", texts)

    def test_generates_units_from_upward_ancestor_paths_only(self):
        texts = [
            unit["text"]
            for unit in self.units("Tulane University in the USA.")
        ]

        self.assertIn("Tulane University", texts)
        self.assertNotIn("University in the USA", texts)
        self.assertNotIn("Tulane University in the USA", texts)
        self.assertNotIn("in the USA", texts)

    def test_compound_phrase_uses_only_the_modifier_to_head_rule(self):
        _, traces = generate_plan(
            "Tulane University.",
            self.nlp,
            self.rules,
            self.rules_digest,
        )

        unit_rules = next(
            match["rules"]
            for match in traces[0]["unit_rules"]
            if match["text"] == "Tulane University"
        )
        self.assertEqual(unit_rules, ["modifier-to-head"])

    def test_trace_table_lists_matching_rules(self):
        _, traces = generate_plan(
            "Tulane University in the USA.",
            self.nlp,
            self.rules,
            self.rules_digest,
        )

        report = render_trace(traces)
        self.assertIn("| 序号 | 学习单元 | 规则标签 |", report)
        self.assertIn("U1", report)
        self.assertIn("FULL", report)
        self.assertNotIn("↑", report)
        self.assertNotIn("〔", report)

    def test_pair_stage_uses_required_slots_and_preserves_optional_paths(self):
        texts = [
            unit["text"]
            for unit in self.units(
                "Researchers from Tulane University in the USA say any kind of light at bedtime could be bad for your heart."
            )
        ]

        self.assertIn("of light", texts)
        self.assertNotIn("kind of light", texts)
        self.assertNotIn("kind of light at bedtime", texts)
        self.assertNotIn("any kind of light at bedtime", texts)
        self.assertIn("Tulane University", texts)
        self.assertNotIn("Researchers from Tulane University", texts)
        self.assertNotIn("Researchers from Tulane University in the USA", texts)

    def test_generates_nested_units_from_one_explicit_anchor_rule(self):
        texts = [
            unit["text"]
            for unit in self.units("Sleeping with a light on could be bad.")
        ]

        self.assertNotIn("with a light", texts)
        self.assertNotIn("Sleeping with a light on", texts)
        self.assertIn("a light", texts)
        self.assertIn("with light", texts)

    def test_nodes_do_not_combine_outputs_from_other_nodes(self):
        rules = {
            "schema_version": 8,
            "max_units_per_anchor": 4096,
            "singleton_rules": [
                {"id": "noun", "priority": 1, "when": {"pos": ["NOUN", "PROPN"]}},
                {"id": "verb", "priority": 1, "when": {"pos": "VERB"}},
            ],
            "unit_rules": [],
        }
        plan, _ = generate_plan("Dogs bark.", self.nlp, rules, "test-rules")
        texts = [unit["text"] for unit in plan["sentences"][0]["units"]]

        self.assertIn("Dogs", texts)
        self.assertIn("bark", texts)
        self.assertNotIn("Dogs bark", texts)

    def test_keeps_complete_sentence_last(self):
        units = self.units("Sleeping with a light on could be bad for you.")

        texts = [unit["text"] for unit in units]
        self.assertIn("light on", texts)
        self.assertIn("a light", texts)
        self.assertNotIn("with a light", texts)
        self.assertNotIn("Sleeping with a light", texts)
        self.assertEqual(units[-1]["kind"], "sentence")
        self.assertEqual(units[-1]["text"], "Sleeping with a light on could be bad for you.")

    def test_sentence_units_reference_original_segments_in_order(self):
        sentence = "Researchers from Tulane University in the USA."
        units = self.units(sentence)
        previous = units[-1]

        self.assertEqual(previous["text"], sentence)
        for unit in units[:-1]:
            pieces = [sentence[segment["start"] : segment["end"]] for segment in unit["segments"]]
            self.assertEqual(" ".join(pieces), unit["text"])
            self.assertTrue(all(segment["start"] < segment["end"] for segment in unit["segments"]))

    def test_rejects_tampered_plan_ranges(self):
        plan = self.plan("Dogs bark.")
        plan["sentences"][0]["units"][0]["segments"][0]["start"] += 1

        with self.assertRaisesRegex(ConfigurationError, "does not match"):
            _validate_plan(plan, self.nlp, self.rules, self.rules_digest)

    def test_rejects_misaligned_translation_prompts(self):
        plan = self.plan("Dogs bark.")
        translations = {
            "schema_version": 1,
            "sentences": [{"unit_prompts": ["狗"]}],
        }

        with self.assertRaisesRegex(ConfigurationError, "must contain exactly"):
            _parse_annotations(json.dumps(translations), plan)

    def test_renders_phraseweave_import_schema(self):
        plan = self.plan("Birdsong is good.")
        translations = {
            "schema_version": 1,
            "sentences": [{
                "unit_prompts": [f"提示 {index}" for index, _ in enumerate(plan["sentences"][0]["units"], 1)]
            }],
        }

        payload = json.loads(render_phraseweave(plan, translations))
        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(len(payload["statements"]), len(plan["sentences"][0]["units"]))
        self.assertEqual(payload["statements"][-1]["english"], "Birdsong is good.")

    def test_renders_markdown_and_escapes_table_content(self):
        plan = {
            "schema_version": 2,
            "rules_version": 5,
            "rules_sha256": "test-rules",
            "sentences": [
                {
                    "sentence": "alpha | beta",
                    "units": [
                        {
                            "text": "alpha | beta",
                            "segments": [{"start": 0, "end": 12}],
                            "kind": "sentence",
                        }
                    ],
                }
            ],
        }
        translations = {
            "schema_version": 1,
            "sentences": [{"unit_prompts": ["甲 | 乙"]}],
        }

        report = render_markdown(plan, translations)
        self.assertIn("甲 \\| 乙", report)
        self.assertIn("alpha \\| beta", report)


if __name__ == "__main__":
    unittest_main()
