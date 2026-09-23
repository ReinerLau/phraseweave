#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "click==8.1.8",
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
#   "spacy==3.8.7",
#   "wn==1.1.1",
# ]
# ///

import json
import sys
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest import main as unittest_main
from unittest.mock import patch

from split_lexical_chunks import (
    ConfigurationError,
    LexiconEntry,
    LexiconMatch,
    ProgressionRules,
    SyntaxToken,
    build_analysis,
    build_learning_units,
    build_trie,
    choose_output_path,
    find_chunks,
    find_lexicon_spans,
    find_sentence_atoms,
    load_rules,
    parse_annotations,
    parse_model_plan,
    phraseweave_path_for,
    render_contextual_report,
    render_phraseweave_backup,
    select_longest_spans,
    split_sentences,
    tokenize,
    validate_analysis,
)
from split_lexical_chunks import main as cli_main

RULES = ProgressionRules(
    content_pos=frozenset({"ADJ", "ADV", "NOUN", "NUM", "PROPN", "VERB"}),
    excluded_pos=frozenset({"AUX", "CCONJ", "DET", "PART", "PRON", "SCONJ"}),
    excluded_dependencies=frozenset(
        {
            "agent",
            "aux",
            "auxpass",
            "case",
            "cc",
            "cop",
            "det",
            "expl",
            "mark",
            "neg",
            "prep",
            "prt",
        }
    ),
    lexical_pos_compatibility={
        "a": frozenset({"ADJ"}),
        "n": frozenset({"NOUN", "PROPN"}),
        "r": frozenset({"ADV"}),
        "s": frozenset({"ADJ"}),
        "v": frozenset({"VERB"}),
    },
    combination_strategy="nominal_phrase_first_right_fold",
    nominal_head_pos=frozenset({"NOUN", "PROPN"}),
    nominal_premodifier_dependencies=frozenset(
        {"advmod", "amod", "compound", "nummod", "npadvmod", "quantmod"}
    ),
    verb_particle_head_pos=frozenset({"VERB"}),
    verb_particle_dependencies=frozenset({"prt"}),
)

LEXICAL_POS = {
    "bark": "v",
    "be": "v",
    "beta": "n",
    "good": "a",
    "look": "v",
    "mental health": "n",
    "take part": "v",
}


def fake_entries(forms):
    for form in forms:
        lemma = "be" if form == "is" else form
        yield LexiconEntry(form, lemma, LEXICAL_POS.get(form, "n"))


def fake_match(start: int, end: int) -> LexiconMatch:
    return LexiconMatch(start, end, frozenset({"example"}), frozenset({"n"}), "surface")


def fake_morphy(form: str):
    lemmas = {
        "dogs": {"dog"},
        "is": {"be"},
        "looked": {"look"},
        "took": {"take"},
    }
    return {None: lemmas.get(form, {form})}


def fake_analyze(sentence: str):
    pos_by_word = {
        "a": ("DET", "det"),
        "and": ("CCONJ", "cc"),
        "be": ("AUX", "cop"),
        "birdsong": ("ADP", "advmod"),
        "for": ("ADP", "prep"),
        "in": ("ADP", "prep"),
        "is": ("AUX", "cop"),
        "our": ("DET", "poss"),
        "the": ("DET", "det"),
        "they": ("PRON", "nsubj"),
        "to": ("ADP", "prep"),
    }
    adjective_words = {"beautiful", "good", "mental", "natural"}
    verb_words = {"bark", "glows", "listened", "matters", "took"}
    syntax = []
    for index, token in enumerate(tokenize(sentence)):
        normalized = token.text.casefold()
        if normalized in pos_by_word:
            pos, dep = pos_by_word[normalized]
        elif normalized in adjective_words:
            pos, dep = "ADJ", "amod"
        elif normalized in verb_words:
            pos, dep = "VERB", "ROOT"
        else:
            pos, dep = "NOUN", "ROOT"
        syntax.append(SyntaxToken(token.text, token.start, token.end, pos, dep, index))
    return syntax


def analyze_with_specs(specs):
    def analyze(sentence: str):
        tokens = tokenize(sentence)
        if len(tokens) != len(specs):
            raise AssertionError(f"expected {len(specs)} tokens, found {len(tokens)}")
        return [
            SyntaxToken(token.text, token.start, token.end, pos, dep, head)
            for token, (pos, dep, head) in zip(tokens, specs, strict=True)
        ]

    return analyze


class SplitLexicalChunksTests(TestCase):
    def atoms(self, sentence: str, forms=()):
        return find_sentence_atoms(
            sentence, build_trie(fake_entries(forms)), fake_morphy, fake_analyze, RULES
        )

    def chunks(self, sentence: str, forms=()):
        return find_chunks(
            sentence, build_trie(fake_entries(forms)), fake_morphy, fake_analyze, RULES
        )

    def analysis(self, sentence: str, forms=(), analyze=fake_analyze):
        return build_analysis(
            [sentence],
            build_trie(fake_entries(forms)),
            fake_morphy,
            analyze,
            RULES,
        )

    @staticmethod
    def sample_analysis():
        return {
            "schema_version": 6,
            "sentences": [
                {
                    "sentence": "Dogs bark.",
                    "atoms": [
                        {
                            "text": "Dogs",
                            "start": 0,
                            "end": 4,
                            "source": "oewn",
                            "lexicon_lemmas": ["dog"],
                            "lexicon_pos": ["n"],
                            "match_kind": "morphy",
                            "head_pos": "NOUN",
                            "head_dep": "ROOT",
                            "head_atom": None,
                            "core": True,
                        },
                        {
                            "text": "bark",
                            "start": 5,
                            "end": 9,
                            "source": "oewn",
                            "lexicon_lemmas": ["bark"],
                            "lexicon_pos": ["v"],
                            "match_kind": "surface",
                            "head_pos": "VERB",
                            "head_dep": "ROOT",
                            "head_atom": None,
                            "core": True,
                        },
                    ],
                    "learning_units": [
                        {
                            "text": "Dogs",
                            "start": 0,
                            "end": 4,
                            "kind": "core",
                            "core_count": 1,
                        },
                        {
                            "text": "bark",
                            "start": 5,
                            "end": 9,
                            "kind": "core",
                            "core_count": 1,
                        },
                    ],
                }
            ],
        }

    @staticmethod
    def sample_annotations():
        return {
            "schema_version": 6,
            "sentences": [
                {
                    "unit_prompts": ["狗", "吠叫"],
                    "sentence_translation": "狗会吠叫。",
                }
            ],
        }

    def test_splits_only_at_sentence_end_punctuation(self):
        self.assertEqual(
            split_sentences("Birdsong is calming, even in cities; listen. It helps!"),
            ["Birdsong is calming, even in cities; listen.", "It helps!"],
        )

    def test_empty_input_has_no_sentences(self):
        self.assertEqual(split_sentences(" \n\t"), [])

    def test_restores_markdown_escaped_line_breaks_before_splitting(self):
        self.assertEqual(
            split_sentences("First sentence.\\\n\\\nSecond sentence."),
            ["First sentence.", "Second sentence."],
        )

    def test_tokenizes_grouped_numbers_apostrophes_and_hyphens(self):
        self.assertEqual(
            [
                token.text
                for token in tokenize("1,500 don't damage nature's well-being.")
            ],
            ["1,500", "don't", "damage", "nature's", "well-being"],
        )

    def test_loads_general_evidence_rules_without_word_overrides(self):
        rules = load_rules()

        self.assertEqual(
            rules.lexical_pos_compatibility["n"], frozenset({"NOUN", "PROPN"})
        )
        self.assertIn("AUX", rules.excluded_pos)
        self.assertIn("det", rules.excluded_dependencies)
        self.assertEqual(rules.combination_strategy, "nominal_phrase_first_right_fold")
        self.assertEqual(rules.nominal_head_pos, frozenset({"NOUN", "PROPN"}))
        self.assertIn("amod", rules.nominal_premodifier_dependencies)
        self.assertEqual(rules.verb_particle_head_pos, frozenset({"VERB"}))
        self.assertEqual(rules.verb_particle_dependencies, frozenset({"prt"}))
        self.assertFalse(hasattr(rules, "force_core_forms"))

    def test_finds_single_and_multiword_oewn_candidates(self):
        sentence = "Birdsong is good for mental health."
        tokens = tokenize(sentence)
        candidates = find_lexicon_spans(
            sentence,
            tokens,
            build_trie(fake_entries(["birdsong", "be", "good", "mental health"])),
            fake_morphy,
        )

        self.assertEqual(
            candidates,
            [
                LexiconMatch(
                    0,
                    1,
                    frozenset({"birdsong"}),
                    frozenset({"n"}),
                    "surface",
                ),
                LexiconMatch(1, 2, frozenset({"be"}), frozenset({"v"}), "morphy"),
                LexiconMatch(2, 3, frozenset({"good"}), frozenset({"a"}), "surface"),
                LexiconMatch(
                    4,
                    6,
                    frozenset({"mental health"}),
                    frozenset({"n"}),
                    "surface",
                ),
            ],
        )

    def test_selects_longest_non_overlapping_oewn_matches(self):
        self.assertEqual(
            select_longest_spans(
                4,
                [
                    fake_match(1, 3),
                    fake_match(0, 2),
                    fake_match(2, 4),
                    fake_match(0, 1),
                ],
            ),
            [fake_match(0, 2), fake_match(2, 4)],
        )

    def test_every_selected_oewn_content_match_becomes_a_core_unit(self):
        analysis = self.analysis(
            "Birdsong is good for our mental health.",
            ["birdsong", "be", "good", "mental health"],
        )["sentences"][0]

        self.assertEqual(
            [unit["text"] for unit in analysis["learning_units"]],
            ["Birdsong", "good", "mental health", "good for our mental health"],
        )
        self.assertEqual(
            [unit["kind"] for unit in analysis["learning_units"]],
            ["core", "core", "core", "composition"],
        )

    def test_contextual_function_word_match_is_not_a_core(self):
        atoms = self.atoms("Birdsong is good.", ["birdsong", "be", "good"])
        is_atom = next(atom for atom in atoms if atom["text"] == "is")

        self.assertEqual(is_atom["source"], "oewn")
        self.assertEqual(is_atom["lexicon_pos"], ["v"])
        self.assertEqual(is_atom["match_kind"], "morphy")
        self.assertFalse(is_atom["core"])

    def test_surface_oewn_content_survives_context_pos_mistag(self):
        atoms = self.atoms("Birdsong matters.", ["birdsong"])
        birdsong = atoms[0]

        self.assertEqual(birdsong["head_pos"], "ADP")
        self.assertEqual(birdsong["head_dep"], "advmod")
        self.assertEqual(birdsong["lexicon_pos"], ["n"])
        self.assertEqual(birdsong["match_kind"], "surface")
        self.assertTrue(birdsong["core"])

    def test_surface_oewn_homograph_in_function_role_is_not_a_core(self):
        atoms = self.atoms("A study matters.", ["a", "study"])
        article = atoms[0]

        self.assertEqual(article["source"], "oewn")
        self.assertEqual(article["lexicon_pos"], ["n"])
        self.assertEqual(article["head_dep"], "det")
        self.assertFalse(article["core"])

    def test_pos_adds_unmatched_content_words_as_core_units(self):
        analysis = self.analysis("Zorb glows.")["sentences"][0]

        self.assertEqual(
            [unit["text"] for unit in analysis["learning_units"]],
            ["Zorb", "glows"],
        )
        self.assertTrue(all(atom["source"] == "token" for atom in analysis["atoms"]))

    def test_function_words_enter_only_when_cores_are_composed(self):
        analysis = self.analysis(
            "Birdsong is good for our mental health.",
            ["birdsong", "be", "good", "mental health"],
        )["sentences"][0]

        core_texts = [
            unit["text"]
            for unit in analysis["learning_units"]
            if unit["kind"] == "core"
        ]
        composition_texts = [
            unit["text"]
            for unit in analysis["learning_units"]
            if unit["kind"] == "composition"
        ]
        self.assertNotIn("is", core_texts)
        self.assertNotIn("for", core_texts)
        self.assertNotIn("our", core_texts)
        self.assertEqual(composition_texts, ["good for our mental health"])

    def test_contiguous_verb_particle_fallback_becomes_one_core(self):
        for sentence, forms in (
            ("Hurry up.", ["hurry", "up"]),
            ("Hurried up.", []),
        ):
            with self.subTest(sentence=sentence):
                analyzed = self.analysis(
                    sentence,
                    forms,
                    analyze_with_specs([("VERB", "ROOT", 0), ("ADP", "prt", 0)]),
                )["sentences"][0]

                self.assertEqual(
                    analyzed["atoms"],
                    [
                        {
                            "text": sentence[:-1],
                            "start": 0,
                            "end": len(sentence) - 1,
                            "source": "syntax",
                            "lexicon_lemmas": [],
                            "lexicon_pos": [],
                            "match_kind": "verb_particle",
                            "head_pos": "VERB",
                            "head_dep": "ROOT",
                            "head_atom": None,
                            "core": True,
                        }
                    ],
                )
                self.assertEqual(
                    [unit["text"] for unit in analyzed["learning_units"]],
                    [sentence[:-1]],
                )

    def test_multiword_oewn_match_precedes_verb_particle_fallback(self):
        for sentence, expression in (
            ("Clean up.", "clean up"),
            ("Watch out.", "watch out"),
        ):
            with self.subTest(sentence=sentence):
                atom = self.analysis(
                    sentence,
                    [expression],
                    analyze_with_specs([("VERB", "ROOT", 0), ("ADP", "prt", 0)]),
                )["sentences"][0]["atoms"][0]

                self.assertEqual(atom["text"], sentence[:-1])
                self.assertEqual(atom["source"], "oewn")
                self.assertEqual(atom["match_kind"], "surface")

    def test_prepositional_up_is_not_a_verb_particle(self):
        analyzed = self.analysis(
            "Walk up the hill.",
            analyze=analyze_with_specs(
                [
                    ("VERB", "ROOT", 0),
                    ("ADP", "prep", 0),
                    ("DET", "det", 3),
                    ("NOUN", "pobj", 1),
                ]
            ),
        )["sentences"][0]

        self.assertFalse(any(atom["source"] == "syntax" for atom in analyzed["atoms"]))
        self.assertEqual(
            [unit["text"] for unit in analyzed["learning_units"]],
            ["Walk", "hill"],
        )

    def test_noncontiguous_verb_particles_are_not_merged(self):
        examples = (
            (
                "Hurry right up.",
                [("VERB", "ROOT", 0), ("ADV", "advmod", 0), ("ADP", "prt", 0)],
            ),
            (
                "Turn the light off.",
                [
                    ("VERB", "ROOT", 0),
                    ("DET", "det", 2),
                    ("NOUN", "dobj", 0),
                    ("ADP", "prt", 0),
                ],
            ),
        )
        for sentence, specs in examples:
            with self.subTest(sentence=sentence):
                atoms = self.analysis(sentence, analyze=analyze_with_specs(specs))[
                    "sentences"
                ][0]["atoms"]

                self.assertFalse(any(atom["source"] == "syntax" for atom in atoms))
                self.assertFalse(atoms[-1]["core"])

    def test_punctuation_prevents_verb_particle_merge(self):
        atoms = self.analysis(
            "Hurry, up.",
            analyze=analyze_with_specs([("VERB", "ROOT", 0), ("ADP", "prt", 0)]),
        )["sentences"][0]["atoms"]

        self.assertFalse(any(atom["source"] == "syntax" for atom in atoms))
        self.assertFalse(atoms[-1]["core"])

    def test_nominal_phrases_are_learned_before_the_right_fold(self):
        sentence = (
            "A researcher said towns needed more green spaces and lower speed limits."
        )
        analysis = self.analysis(
            sentence,
            ["speed limits"],
            analyze_with_specs(
                [
                    ("DET", "det", 1),
                    ("NOUN", "nsubj", 2),
                    ("VERB", "ROOT", 2),
                    ("NOUN", "nsubj", 4),
                    ("VERB", "ccomp", 2),
                    ("ADV", "amod", 7),
                    ("ADJ", "amod", 7),
                    ("NOUN", "dobj", 4),
                    ("CCONJ", "cc", 7),
                    ("ADJ", "amod", 11),
                    ("NOUN", "compound", 11),
                    ("NOUN", "conj", 7),
                ]
            ),
        )["sentences"][0]

        self.assertEqual(
            [(unit["text"], unit["core_count"]) for unit in analysis["learning_units"]],
            [
                ("researcher", 1),
                ("said", 1),
                ("towns", 1),
                ("needed", 1),
                ("more", 1),
                ("green", 1),
                ("spaces", 1),
                ("lower", 1),
                ("speed limits", 1),
                ("green spaces", 2),
                ("more green spaces", 3),
                ("lower speed limits", 2),
                ("more green spaces and lower speed limits", 5),
                ("needed more green spaces and lower speed limits", 6),
                ("towns needed more green spaces and lower speed limits", 7),
                ("said towns needed more green spaces and lower speed limits", 8),
            ],
        )
        self.assertNotIn(
            "spaces and lower speed limits",
            [unit["text"] for unit in analysis["learning_units"]],
        )

    def test_coordinated_nominal_phrases_are_built_separately(self):
        sentence = "They listened to natural sounds and traffic noise."
        analysis = self.analysis(
            sentence,
            analyze=analyze_with_specs(
                [
                    ("PRON", "nsubj", 1),
                    ("VERB", "ROOT", 1),
                    ("ADP", "prep", 1),
                    ("ADJ", "amod", 4),
                    ("NOUN", "pobj", 2),
                    ("CCONJ", "cc", 4),
                    ("NOUN", "compound", 7),
                    ("NOUN", "conj", 4),
                ]
            ),
        )["sentences"][0]

        self.assertEqual(
            [
                unit["text"]
                for unit in analysis["learning_units"]
                if unit["kind"] == "composition"
            ],
            ["natural sounds", "traffic noise", "natural sounds and traffic noise"],
        )

    def test_nominal_phrase_expands_from_its_head_outward(self):
        sentence = "It is one of nature's most beautiful sounds."
        analysis = self.analysis(
            sentence,
            analyze=analyze_with_specs(
                [
                    ("PRON", "nsubj", 1),
                    ("AUX", "ROOT", 1),
                    ("NUM", "attr", 1),
                    ("ADP", "prep", 2),
                    ("NOUN", "poss", 7),
                    ("ADV", "advmod", 6),
                    ("ADJ", "amod", 7),
                    ("NOUN", "pobj", 3),
                ]
            ),
        )["sentences"][0]

        self.assertEqual(
            [
                unit["text"]
                for unit in analysis["learning_units"]
                if unit["kind"] == "composition"
            ],
            [
                "beautiful sounds",
                "most beautiful sounds",
                "nature's most beautiful sounds",
            ],
        )

    def test_unrelated_adverb_is_not_absorbed_into_a_nominal_phrase(self):
        sentence = "Quickly green spaces grow."
        analysis = self.analysis(
            sentence,
            analyze=analyze_with_specs(
                [
                    ("ADV", "advmod", 3),
                    ("ADJ", "amod", 2),
                    ("NOUN", "nsubj", 3),
                    ("VERB", "ROOT", 3),
                ]
            ),
        )["sentences"][0]

        self.assertEqual(
            [
                unit["text"]
                for unit in analysis["learning_units"]
                if unit["kind"] == "composition"
            ],
            ["green spaces", "green spaces grow"],
        )

    def test_right_fold_adds_one_group_per_composition(self):
        sentence = "Alpha is beta for gamma and delta."
        analysis = self.analysis(sentence, ["alpha", "be", "beta", "gamma", "delta"])[
            "sentences"
        ][0]

        self.assertEqual(
            [(unit["text"], unit["core_count"]) for unit in analysis["learning_units"]],
            [
                ("Alpha", 1),
                ("beta", 1),
                ("gamma", 1),
                ("delta", 1),
                ("gamma and delta", 2),
                ("beta for gamma and delta", 3),
            ],
        )

    def test_two_cores_progress_directly_to_the_complete_sentence(self):
        self.assertEqual(
            self.chunks("Dogs bark.", ["dog", "bark"]),
            ["Dogs", "bark", "Dogs bark."],
        )

    def test_morphy_matches_inflected_oewn_expression(self):
        atoms = self.atoms("Many people took part in the study.", ["take part"])

        self.assertIn(
            {
                "text": "took part",
                "start": 12,
                "end": 21,
                "source": "oewn",
                "lexicon_lemmas": ["take part"],
                "lexicon_pos": ["v"],
                "match_kind": "morphy",
                "head_pos": "VERB",
                "head_dep": "ROOT",
                "head_atom": None,
                "core": True,
            },
            atoms,
        )

    def test_builds_schema_six_analysis(self):
        self.assertEqual(
            self.analysis("Dogs bark.", ["dog", "bark"]),
            self.sample_analysis(),
        )

    def test_build_learning_units_is_deterministic(self):
        analysis = self.sample_analysis()["sentences"][0]

        self.assertEqual(
            build_learning_units(analysis["sentence"], analysis["atoms"], RULES),
            analysis["learning_units"],
        )

    def test_contextual_report_does_not_escape_hyphens(self):
        analysis = {
            "sentences": [
                {
                    "sentence": "Birdsong benefited well-being.",
                    "atoms": [
                        {
                            "text": "well-being",
                            "start": 19,
                            "end": 29,
                            "source": "token",
                            "lexicon_lemmas": [],
                            "lexicon_pos": [],
                            "match_kind": "none",
                            "head_pos": "NOUN",
                            "head_dep": "ROOT",
                            "head_atom": None,
                            "core": True,
                        }
                    ],
                    "learning_units": [
                        {
                            "text": "well-being",
                            "start": 19,
                            "end": 29,
                            "kind": "core",
                            "core_count": 1,
                        }
                    ],
                }
            ]
        }
        annotations = {
            "sentences": [
                {
                    "unit_prompts": ["幸福感"],
                    "sentence_translation": "鸟鸣有益于幸福感。",
                }
            ]
        }

        report = render_contextual_report(analysis, annotations)

        self.assertIn("| 1 | 幸福感 | well-being |", report)
        self.assertNotIn(r"well\-being", report)

    def test_validates_deterministic_analysis(self):
        self.assertEqual(
            validate_analysis(self.sample_analysis()), self.sample_analysis()
        )

    def test_rejects_tampered_learning_units(self):
        payload = self.sample_analysis()
        payload["sentences"][0]["learning_units"][0]["text"] = "Cats"

        with self.assertRaisesRegex(ConfigurationError, "must match"):
            validate_analysis(payload)

    def test_rejects_missing_oewn_evidence(self):
        payload = self.sample_analysis()
        payload["sentences"][0]["atoms"][0]["lexicon_pos"] = []

        with self.assertRaisesRegex(ConfigurationError, "evidence must be non-empty"):
            validate_analysis(payload)

    def test_validates_verb_particle_syntax_evidence(self):
        def payload():
            return self.analysis(
                "Hurry up.",
                analyze=analyze_with_specs([("VERB", "ROOT", 0), ("ADP", "prt", 0)]),
            )

        self.assertEqual(validate_analysis(payload()), payload())

        invalid = payload()
        invalid["sentences"][0]["atoms"][0]["lexicon_pos"] = ["v"]
        with self.assertRaisesRegex(ConfigurationError, "must not claim OEWN data"):
            validate_analysis(invalid)

        invalid = payload()
        invalid["sentences"][0]["atoms"][0]["match_kind"] = "none"
        with self.assertRaisesRegex(ConfigurationError, "match_kind is unsupported"):
            validate_analysis(invalid)

        invalid = payload()
        invalid["sentences"][0]["atoms"][0]["head_pos"] = "NOUN"
        with self.assertRaisesRegex(ConfigurationError, "configured POS"):
            validate_analysis(invalid)

        invalid = payload()
        invalid["sentences"][0]["atoms"][0]["core"] = False
        with self.assertRaisesRegex(ConfigurationError, "must be a core"):
            validate_analysis(invalid)

    def test_rejects_schema_five_analysis(self):
        payload = self.sample_analysis()
        payload["schema_version"] = 5

        with self.assertRaisesRegex(ConfigurationError, "schema_version 6"):
            validate_analysis(payload)

    def test_rejects_missing_or_invalid_head_atom(self):
        payload = self.sample_analysis()
        del payload["sentences"][0]["atoms"][0]["head_atom"]
        with self.assertRaisesRegex(ConfigurationError, "missing keys"):
            validate_analysis(payload)

        payload = self.sample_analysis()
        payload["sentences"][0]["atoms"][0]["head_atom"] = 99
        with self.assertRaisesRegex(ConfigurationError, "must reference an atom"):
            validate_analysis(payload)

        payload = self.sample_analysis()
        payload["sentences"][0]["atoms"][0]["head_atom"] = 0
        with self.assertRaisesRegex(ConfigurationError, "must not reference itself"):
            validate_analysis(payload)

        payload = self.sample_analysis()
        payload["sentences"][0]["atoms"][0]["head_dep"] = "nsubj"
        with self.assertRaisesRegex(ConfigurationError, "syntactic head"):
            validate_analysis(payload)

    def test_rejects_cyclic_head_atom_references(self):
        payload = self.sample_analysis()
        atoms = payload["sentences"][0]["atoms"]
        atoms[0]["head_dep"] = "nsubj"
        atoms[0]["head_atom"] = 1
        atoms[1]["head_dep"] = "dobj"
        atoms[1]["head_atom"] = 0

        with self.assertRaisesRegex(ConfigurationError, "must be acyclic"):
            validate_analysis(payload)

    def test_parses_aligned_chinese_prompts(self):
        annotations = self.sample_annotations()

        self.assertEqual(
            parse_annotations(json.dumps(annotations), self.sample_analysis()),
            annotations,
        )

    def test_rejects_invalid_annotation_json(self):
        with self.assertRaisesRegex(ConfigurationError, "not valid JSON"):
            parse_annotations("{", self.sample_analysis())

    def test_rejects_schema_five_annotations(self):
        payload = self.sample_annotations()
        payload["schema_version"] = 5

        with self.assertRaisesRegex(ConfigurationError, "schema_version 6"):
            parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_rejects_missing_or_extra_sentence_annotations(self):
        for sentences in ([], self.sample_annotations()["sentences"] * 2):
            with self.subTest(count=len(sentences)):
                payload = {"schema_version": 6, "sentences": sentences}
                with self.assertRaisesRegex(ConfigurationError, "exactly 1 items"):
                    parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_rejects_wrong_prompt_count(self):
        payload = self.sample_annotations()
        payload["sentences"][0]["unit_prompts"] = ["狗"]

        with self.assertRaisesRegex(ConfigurationError, "exactly 2 items"):
            parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_rejects_empty_prompt_or_translation(self):
        for field in ("unit_prompts", "sentence_translation"):
            with self.subTest(field=field):
                payload = self.sample_annotations()
                payload["sentences"][0][field] = (
                    ["狗", " "] if field == "unit_prompts" else " "
                )
                with self.assertRaisesRegex(ConfigurationError, "non-empty"):
                    parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_rejects_unknown_annotation_fields(self):
        payload = self.sample_annotations()
        payload["sentences"][0]["english"] = "Dogs bark."

        with self.assertRaisesRegex(ConfigurationError, "unknown keys"):
            parse_annotations(json.dumps(payload), self.sample_analysis())

    def test_parses_model_plan_with_context_bound_construction(self):
        sentence = "Sleeping with a light on could be bad for you."
        analysis = {
            "schema_version": 6,
            "sentences": [
                {
                    "sentence": sentence,
                    "atoms": [
                        {"start": 0, "end": 13, "core": True},
                        {"start": 14, "end": 15, "core": False},
                        {"start": 16, "end": 21, "core": True},
                        {"start": 22, "end": 24, "core": False},
                        {"start": 25, "end": 30, "core": False},
                        {"start": 31, "end": 33, "core": False},
                        {"start": 34, "end": 37, "core": True},
                        {"start": 38, "end": 41, "core": False},
                        {"start": 42, "end": 45, "core": False},
                    ],
                }
            ],
        }
        for atom in analysis["sentences"][0]["atoms"]:
            atom.update(
                {
                    "source": "token",
                    "lexicon_lemmas": [],
                    "lexicon_pos": [],
                    "match_kind": "none",
                    "head_pos": "NOUN" if atom["core"] else "ADP",
                    "head_dep": "ROOT",
                    "head_atom": None,
                }
            )
        plan = {
            "schema_version": 1,
            "sentences": [
                {
                    "sentence": sentence,
                    "units": [
                        {
                            "start": 0,
                            "end": 13,
                            "kind": "core",
                            "construction_family": None,
                        },
                        {
                            "start": 16,
                            "end": 21,
                            "kind": "core",
                            "construction_family": None,
                        },
                        {
                            "start": 34,
                            "end": 37,
                            "kind": "core",
                            "construction_family": None,
                        },
                        {
                            "start": 0,
                            "end": 24,
                            "kind": "construction",
                            "construction_family": "state_frame",
                        },
                    ],
                    "unit_prompts": [
                        "开着灯睡觉",
                        "光线",
                        "不好的",
                        "开着灯睡觉",
                    ],
                    "sentence_translation": "开着灯睡觉可能对你不好。",
                }
            ],
        }

        normalized_analysis, annotations = parse_model_plan(
            json.dumps(plan), analysis
        )

        self.assertEqual(
            normalized_analysis["sentences"][0]["learning_units"][-1],
            {
                "text": "Sleeping with a light on",
                "start": 0,
                "end": 24,
                "kind": "construction",
                "core_count": 2,
                "construction_family": "state_frame",
            },
        )
        report = render_contextual_report(normalized_analysis, annotations)
        self.assertIn(
            "| 4 | 开着灯睡觉 | Sleeping with a light on | 组合·句式构式 |",
            report,
        )

    def test_rejects_model_plan_with_invalid_source_range(self):
        analysis = self.sample_analysis()
        plan = {
            "schema_version": 1,
            "sentences": [
                {
                    "sentence": "Dogs bark.",
                    "units": [
                        {
                            "start": 0,
                            "end": 3,
                            "kind": "core",
                            "construction_family": None,
                        },
                        {
                            "start": 5,
                            "end": 9,
                            "kind": "core",
                            "construction_family": None,
                        },
                    ],
                    "unit_prompts": ["狗", "吠叫"],
                    "sentence_translation": "狗会吠叫。",
                }
            ],
        }

        with self.assertRaisesRegex(ConfigurationError, "token boundaries"):
            parse_model_plan(json.dumps(plan), analysis)

    def test_rejects_model_plan_with_complete_sentence_as_intermediate_unit(self):
        analysis = self.sample_analysis()
        plan = {
            "schema_version": 1,
            "sentences": [
                {
                    "sentence": "Dogs bark.",
                    "units": [
                        {
                            "start": 0,
                            "end": 4,
                            "kind": "core",
                            "construction_family": None,
                        },
                        {
                            "start": 5,
                            "end": 9,
                            "kind": "core",
                            "construction_family": None,
                        },
                        {
                            "start": 0,
                            "end": 10,
                            "kind": "construction",
                            "construction_family": "clause_frame",
                        },
                    ],
                    "unit_prompts": ["狗", "吠叫", "狗会吠叫"],
                    "sentence_translation": "狗会吠叫。",
                }
            ],
        }

        with self.assertRaisesRegex(ConfigurationError, "complete sentence"):
            parse_model_plan(json.dumps(plan), analysis)

    def test_renders_script_units_and_appends_complete_sentence(self):
        analysis = self.analysis(
            "Birdsong is good for our mental health.",
            ["birdsong", "be", "good", "mental health"],
        )
        annotations = {
            "schema_version": 6,
            "sentences": [
                {
                    "unit_prompts": [
                        "鸟鸣",
                        "有益的",
                        "心理健康",
                        "对我们的心理健康有益",
                    ],
                    "sentence_translation": "鸟鸣有益于我们的心理健康。",
                }
            ],
        }

        self.assertEqual(
            render_contextual_report(analysis, annotations),
            "# 渐进学习单元\n\n"
            "## 第 1 句\n\n"
            "| 步骤 | 中文提示 | 英文答案 | 匹配标签 |\n"
            "|---:|---|---|---|\n"
            "| 1 | 鸟鸣 | Birdsong | 核心·词典匹配 |\n"
            "| 2 | 有益的 | good | 核心·词典匹配 |\n"
            "| 3 | 心理健康 | mental health | 核心·词典匹配 |\n"
            "| 4 | 对我们的心理健康有益 | good for our mental health | 组合·渐进组合 |\n"
            "| 5 | 鸟鸣有益于我们的心理健康。 | Birdsong is good for our mental health. | 完成·完整原句 |\n",
        )

    def test_contextual_report_explains_syntax_and_token_cores(self):
        analysis = {
            "sentences": [
                {
                    "sentence": "Hurry up now.",
                    "atoms": [
                        {
                            "text": "Hurry up",
                            "start": 0,
                            "end": 8,
                            "source": "syntax",
                            "lexicon_lemmas": [],
                            "lexicon_pos": [],
                            "match_kind": "verb_particle",
                            "head_pos": "VERB",
                            "head_dep": "ROOT",
                            "head_atom": None,
                            "core": True,
                        },
                        {
                            "text": "now",
                            "start": 9,
                            "end": 12,
                            "source": "token",
                            "lexicon_lemmas": [],
                            "lexicon_pos": [],
                            "match_kind": "none",
                            "head_pos": "ADV",
                            "head_dep": "advmod",
                            "head_atom": 0,
                            "core": True,
                        },
                    ],
                    "learning_units": [
                        {
                            "text": "Hurry up",
                            "start": 0,
                            "end": 8,
                            "kind": "core",
                            "core_count": 1,
                        },
                        {
                            "text": "now",
                            "start": 9,
                            "end": 12,
                            "kind": "core",
                            "core_count": 1,
                        },
                    ],
                }
            ]
        }
        annotations = {
            "sentences": [
                {
                    "unit_prompts": ["赶快", "现在"],
                    "sentence_translation": "现在赶快。",
                }
            ]
        }

        report = render_contextual_report(analysis, annotations)

        self.assertIn("核心·动词 \\+ 小品词", report)
        self.assertIn("核心·实义词", report)

    def test_contextual_report_labels_noun_phrase_compositions(self):
        analysis = self.analysis(
            "Green spaces grow.",
            analyze=analyze_with_specs(
                [
                    ("ADJ", "amod", 1),
                    ("NOUN", "nsubj", 2),
                    ("VERB", "ROOT", 2),
                ]
            ),
        )
        annotations = {
            "sentences": [
                {
                    "unit_prompts": ["绿色的", "空间", "生长", "绿色空间"],
                    "sentence_translation": "绿色空间在生长。",
                }
            ]
        }

        report = render_contextual_report(analysis, annotations)

        self.assertIn("| 4 | 绿色空间 | Green spaces | 组合·名词短语 |", report)

    def test_contextual_report_uses_one_label_per_learning_unit(self):
        analysis = {
            "sentences": [
                {
                    "sentence": "Dogs bark.",
                    "atoms": [
                        {
                            "text": "Dogs",
                            "start": 0,
                            "end": 4,
                            "source": "oewn",
                            "lexicon_lemmas": ["dog|animal"],
                            "lexicon_pos": ["n"],
                            "match_kind": "surface",
                            "head_pos": "NOUN",
                            "head_dep": "ROOT",
                            "head_atom": None,
                            "core": True,
                        }
                    ],
                    "learning_units": [
                        {
                            "text": "Dogs",
                            "start": 0,
                            "end": 4,
                            "kind": "core",
                            "core_count": 1,
                        }
                    ],
                }
            ]
        }
        annotations = {
            "sentences": [
                {
                    "unit_prompts": ["狗"],
                    "sentence_translation": "狗会吠叫。",
                }
            ]
        }

        report = render_contextual_report(analysis, annotations)

        self.assertIn("| 1 | 狗 | Dogs | 核心·词典匹配 |", report)
        self.assertNotIn("dog|animal", report)

    def test_renders_phraseweave_backup_with_complete_sentences(self):
        analysis = {
            "sentences": [
                {
                    "sentence": "Birdsong is good.",
                    "learning_units": [
                        {"text": "Birdsong"},
                        {"text": "good"},
                    ],
                },
                {
                    "sentence": "Dogs bark.",
                    "learning_units": [{"text": "Dogs"}, {"text": "bark"}],
                },
            ]
        }
        annotations = {
            "sentences": [
                {
                    "unit_prompts": ["鸟鸣", "有益的"],
                    "sentence_translation": "鸟鸣很好。",
                },
                {
                    "unit_prompts": ["狗", "吠叫"],
                    "sentence_translation": "狗吠叫。",
                },
            ]
        }

        self.assertEqual(
            json.loads(render_phraseweave_backup(analysis, annotations)),
            {
                "schema_version": 1,
                "statements": [
                    {"chinese": "鸟鸣", "english": "Birdsong", "soundmark": ""},
                    {"chinese": "有益的", "english": "good", "soundmark": ""},
                    {
                        "chinese": "鸟鸣很好。",
                        "english": "Birdsong is good.",
                        "soundmark": "",
                    },
                    {"chinese": "狗", "english": "Dogs", "soundmark": ""},
                    {"chinese": "吠叫", "english": "bark", "soundmark": ""},
                    {"chinese": "狗吠叫。", "english": "Dogs bark.", "soundmark": ""},
                ],
            },
        )

    def test_derives_phraseweave_output_path(self):
        self.assertEqual(
            phraseweave_path_for(Path("out/text.learning-units.md")),
            Path("out/text.learning-units.json"),
        )
        self.assertEqual(
            phraseweave_path_for(Path("out/report.md")), Path("out/report.json")
        )
        self.assertEqual(
            phraseweave_path_for(Path("out/report")), Path("out/report.json")
        )

    def test_renders_phraseweave_format_to_custom_path(self):
        with TemporaryDirectory() as directory:
            analysis_path = Path(directory) / "analysis.json"
            output_path = Path(directory) / "import.json"
            analysis_path.write_text(
                json.dumps(self.sample_analysis()), encoding="utf-8"
            )
            annotations = self.sample_annotations()
            stderr = StringIO()
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "split_lexical_chunks.py",
                        "--render-analysis",
                        str(analysis_path),
                        "--format",
                        "phraseweave",
                        "--output",
                        str(output_path),
                    ],
                ),
                patch.object(sys, "stdin", StringIO(json.dumps(annotations))),
                redirect_stderr(stderr),
            ):
                status = cli_main()

            self.assertEqual(status, 0)
            self.assertEqual(json.loads(output_path.read_text()), {
                "schema_version": 1,
                "statements": [
                    {"chinese": "狗", "english": "Dogs", "soundmark": ""},
                    {"chinese": "吠叫", "english": "bark", "soundmark": ""},
                    {
                        "chinese": "狗会吠叫。",
                        "english": "Dogs bark.",
                        "soundmark": "",
                    },
                ],
            })
            self.assertEqual(stderr.getvalue(), "")

    def test_renders_model_plan(self):
        with TemporaryDirectory() as directory:
            analysis_path = Path(directory) / "analysis.json"
            output_path = Path(directory) / "report.learning-units.md"
            analysis_path.write_text(
                json.dumps(self.sample_analysis()), encoding="utf-8"
            )
            plan = {
                "schema_version": 1,
                "sentences": [
                    {
                        "sentence": "Dogs bark.",
                        "units": [
                            {
                                "start": 0,
                                "end": 4,
                                "kind": "core",
                                "construction_family": None,
                            },
                            {
                                "start": 5,
                                "end": 9,
                                "kind": "core",
                                "construction_family": None,
                            },
                        ],
                        "unit_prompts": ["狗", "吠叫"],
                        "sentence_translation": "狗会吠叫。",
                    }
                ],
            }
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "split_lexical_chunks.py",
                        "--render-model-plan",
                        str(analysis_path),
                        "--output",
                        str(output_path),
                    ],
                ),
                patch.object(sys, "stdin", StringIO(json.dumps(plan))),
            ):
                status = cli_main()

            self.assertEqual(status, 0)
            self.assertIn("| 1 | 狗 | Dogs | 核心·词典匹配 |", output_path.read_text())
            self.assertIn(
                "| 3 | 狗会吠叫。 | Dogs bark. | 完成·完整原句 |",
                output_path.read_text(),
            )

    def test_renders_both_formats_to_separate_paths(self):
        with TemporaryDirectory() as directory:
            analysis_path = Path(directory) / "analysis.json"
            markdown_path = Path(directory) / "report.learning-units.md"
            phraseweave_path = Path(directory) / "custom-import.json"
            analysis_path.write_text(
                json.dumps(self.sample_analysis()), encoding="utf-8"
            )
            with patch.object(
                sys,
                "argv",
                [
                    "split_lexical_chunks.py",
                    "--render-analysis",
                    str(analysis_path),
                    "--format",
                    "both",
                    "--output",
                    str(markdown_path),
                    "--phraseweave-output",
                    str(phraseweave_path),
                ],
            ), patch.object(
                sys, "stdin", StringIO(json.dumps(self.sample_annotations()))
            ):
                status = cli_main()

            self.assertEqual(status, 0)
            self.assertTrue(markdown_path.exists())
            self.assertTrue(phraseweave_path.exists())

    def test_renders_both_formats_with_derived_phraseweave_path(self):
        with TemporaryDirectory() as directory:
            analysis_path = Path(directory) / "analysis.json"
            markdown_path = Path(directory) / "report.learning-units.md"
            analysis_path.write_text(
                json.dumps(self.sample_analysis()), encoding="utf-8"
            )
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "split_lexical_chunks.py",
                        "--render-analysis",
                        str(analysis_path),
                        "--format",
                        "both",
                        "--output",
                        str(markdown_path),
                    ],
                ),
                patch.object(sys, "stdin", StringIO(json.dumps(self.sample_annotations()))),
            ):
                status = cli_main()

            self.assertEqual(status, 0)
            self.assertTrue(markdown_path.exists())
            self.assertTrue(Path(directory, "report.learning-units.json").exists())

    def test_both_formats_do_not_write_when_annotation_validation_fails(self):
        with TemporaryDirectory() as directory:
            analysis_path = Path(directory) / "analysis.json"
            markdown_path = Path(directory) / "report.learning-units.md"
            phraseweave_path = Path(directory) / "report.json"
            analysis_path.write_text(
                json.dumps(self.sample_analysis()), encoding="utf-8"
            )
            stderr = StringIO()
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "split_lexical_chunks.py",
                        "--render-analysis",
                        str(analysis_path),
                        "--format",
                        "both",
                        "--output",
                        str(markdown_path),
                        "--phraseweave-output",
                        str(phraseweave_path),
                    ],
                ),
                patch.object(sys, "stdin", StringIO("{")),
                redirect_stderr(stderr),
            ):
                status = cli_main()

            self.assertEqual(status, 1)
            self.assertIn("not valid JSON", stderr.getvalue())
            self.assertFalse(markdown_path.exists())
            self.assertFalse(phraseweave_path.exists())

    def test_rejects_cli_without_analysis_or_render_mode(self):
        with TemporaryDirectory() as directory:
            output_path = Path(directory) / "report.learning-units.md"
            stderr = StringIO()
            with (
                patch.object(
                    sys,
                    "argv",
                    ["split_lexical_chunks.py", "--output", str(output_path)],
                ),
                redirect_stderr(stderr),
            ):
                status = cli_main()

            self.assertEqual(status, 1)
            self.assertIn(
                "specify --analysis-output, --render-analysis, or --render-model-plan",
                stderr.getvalue(),
            )
            self.assertFalse(output_path.exists())

    def test_rejects_phraseweave_format_without_annotations(self):
        stderr = StringIO()
        with (
            patch.object(
                sys,
                "argv",
                ["split_lexical_chunks.py", "--format", "phraseweave"],
            ),
            patch.object(sys, "stdin", StringIO("Dogs bark.")),
            patch.object(
                sys,
                "stdout",
                StringIO(),
            ),
            redirect_stderr(stderr),
            patch(
                "split_lexical_chunks.load_syntax_model",
                side_effect=ConfigurationError("not expected to load analysis"),
            ),
        ):
            status = cli_main()

        self.assertEqual(status, 1)
        self.assertIn(
            "specify --analysis-output, --render-analysis, or --render-model-plan",
            stderr.getvalue(),
        )

    def test_render_validation_failure_does_not_create_report(self):
        with TemporaryDirectory() as directory:
            analysis_path = Path(directory) / "analysis.json"
            output_path = Path(directory) / "report.learning-units.md"
            analysis_path.write_text(
                json.dumps(self.sample_analysis()), encoding="utf-8"
            )
            stderr = StringIO()
            with (
                patch.object(
                    sys,
                    "argv",
                    [
                        "split_lexical_chunks.py",
                        "--render-analysis",
                        str(analysis_path),
                        "--output",
                        str(output_path),
                    ],
                ),
                patch.object(sys, "stdin", StringIO("{")),
                redirect_stderr(stderr),
            ):
                status = cli_main()

            self.assertEqual(status, 1)
            self.assertIn("not valid JSON", stderr.getvalue())
            self.assertFalse(output_path.exists())

    def test_increments_name_before_learning_units_suffix(self):
        with TemporaryDirectory() as directory:
            requested = Path(directory) / "text.learning-units.md"
            requested.touch()
            (Path(directory) / "text-2.learning-units.md").touch()

            self.assertEqual(
                choose_output_path(requested).name,
                "text-3.learning-units.md",
            )


if __name__ == "__main__":
    unittest_main()
