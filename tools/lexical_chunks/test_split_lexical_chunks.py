import json
from copy import deepcopy
from unittest import TestCase
from unittest import main as unittest_main

from split_lexical_chunks import (
    ConfigurationError,
    _exercise_steps,
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
FIRST_UNITS = """USA
the USA
in the USA
Tulane
University
Tulane University
University in the USA
Tulane University in the USA
from Tulane University in the USA
Researchers
Researchers from Tulane University in the USA
light
of light
bedtime
at bedtime
kind
any kind
kind of light
any kind of light
any kind of light at bedtime
your
heart
your heart
for your heart
bad
bad for your heart
could be
be bad for your heart
could be bad for your heart
any kind of light at bedtime could be bad for your heart
say
Researchers from Tulane University in the USA say
say any kind of light at bedtime could be bad for your heart
Researchers from Tulane University in the USA say any kind of light at bedtime could be bad for your heart""".splitlines()

SECOND_SENTENCE = "The young teacher gave her students a difficult problem after class."
PENALTIES_SENTENCE = (
    "The new penalties will also be applied to other anti-social behaviour, "
    "such as putting feet on seats, littering, and eating or drinking on buses"
)
SECOND_UNITS = """young
teacher
young teacher
The young teacher
her
students
her students
class
after class
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
The young teacher gave her students a difficult problem after class.""".splitlines()


class AdjacentSubtreeLearningUnitTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()

    def plan(self, text):
        return generate_plan(text, self.nlp)[0]

    def test_reported_sentence_preserves_quotes_in_plan_and_exports(self):
        source = (
            'The LTA added: "Public transport is a shared space, and every commuter '
            'has a part to play in ensuring a gracious and pleasant commuting environment."'
        )
        plan, traces = generate_plan(source, self.nlp)
        sentence = plan["sentences"][0]
        self.assertEqual(sentence["sentence"], source)
        self.assertEqual(sentence["units"][-1]["text"], source)
        self.assertEqual(sentence["units"][-1]["span"], {"start": 0, "end": len(source)})
        self.assertEqual(_validate_plan(plan, self.nlp), plan)
        for unit in sentence["units"]:
            self.assertEqual(unit["text"], source[unit["span"]["start"]:unit["span"]["end"]])
        clean_plan, clean_traces = generate_plan(source.replace('"', ''), self.nlp)
        self.assertEqual(traces[0]["tree_tokens"], clean_traces[0]["tree_tokens"])
        self.assertEqual(len(sentence["units"]), len(clean_plan["sentences"][0]["units"]))
        self.assertIsNotNone(traces[0]["sources"][-1])
        prompts = {"sentences": [{"sentence_chinese": "整句提示"}]}
        self.assertIn(f"| {source} | 整句 |", render_markdown(plan, prompts, traces))
        rows = json.loads(render_phraseweave(plan, prompts, traces))["statements"]
        self.assertEqual(rows[-1]["english"], source)
        self.assertEqual(rows[-1]["context_before"], "")
        self.assertEqual(rows[-1]["context_after"], "")
        for row in rows:
            self.assertEqual(row["context_before"] + row["english"] + row["context_after"], source)
        by_id = {row["unit_id"]: row for row in rows}
        self.assertTrue(all(unit_id in by_id for row in rows for unit_id in row["source_unit_ids"]))

    def test_matches_manual_postorder_examples(self):
        for source, expected in ((FIRST_SENTENCE, FIRST_UNITS), (SECOND_SENTENCE, SECOND_UNITS)):
            with self.subTest(source=source):
                units = self.plan(source)["sentences"][0]["units"]
                formerly_filtered_spans = {
                    (token.idx, token.idx + len(token.text))
                    for token in self.nlp(source)
                    if token.pos_ in {"DET", "ADP", "AUX"}
                }
                previous_sequence = [
                    unit["text"] for unit in units
                    if unit["kind"] != "word"
                    or (unit["span"]["start"], unit["span"]["end"]) not in formerly_filtered_spans
                ]
                self.assertEqual(previous_sequence, expected)
                self.assertEqual(len(units), len(expected) + len(formerly_filtered_spans))
                self.assertEqual(units[-1]["kind"], "sentence")
                self.assertEqual(sum(unit["kind"] == "sentence" for unit in units), 1)

    def test_leaf_child_follows_non_leaf_siblings_before_head(self):
        texts = [unit["text"] for unit in self.plan(FIRST_SENTENCE + ".")["sentences"][0]["units"]]
        index = texts.index("bad for your heart")
        self.assertEqual(
            texts[index:index + 6],
            ["bad for your heart", "could", "be", "could be", "be bad for your heart", "could be bad for your heart"],
        )

    def test_every_nonpunctuation_token_is_a_word_unit(self):
        source = SECOND_SENTENCE
        units = self.plan(source)["sentences"][0]["units"]
        texts = [unit["text"] for unit in units]
        self.assertIn("The", texts)
        self.assertIn("a", texts)
        self.assertIn("after", texts)
        self.assertIn("her", texts)
        self.assertIn("after class", texts)
        self.assertIn("a difficult problem after class", texts)
        self.assertEqual(
            {(unit["span"]["start"], unit["span"]["end"]) for unit in units if unit["kind"] == "word"},
            {(token.idx, token.idx + len(token.text)) for token in self.nlp(source) if not token.is_space and not token.is_punct},
        )
        for unit in units:
            start, end = unit["span"]["start"], unit["span"]["end"]
            self.assertEqual(unit["text"], source[start:end])

    def test_function_words_are_available_as_review_sources(self):
        plan, traces = generate_plan(FIRST_SENTENCE + ".", self.nlp)
        sentence = plan["sentences"][0]
        texts = [unit["text"] for unit in sentence["units"]]
        self.assertIn("the", texts)
        self.assertIn("of", texts)
        self.assertIn("could", texts)
        self.assertIn("be", texts)
        self.assertIn("of light", texts)
        self.assertIn("could be", texts)
        by_span = {
            (unit["span"]["start"], unit["span"]["end"]): unit["text"]
            for unit in sentence["units"]
        }
        for text, expected in (("the USA", ["the", "USA"]), ("of light", ["of", "light"]), ("could be", ["could", "be"])):
            spans = traces[0]["sources"][texts.index(text)]
            self.assertEqual([by_span[span] for span in spans], expected)

        translations = {"sentences": [{"sentence_chinese": "整句提示"}]}
        rows = json.loads(render_phraseweave(plan, translations, traces))["statements"]
        first_by_id = {}
        for index, row in enumerate(rows):
            first_by_id.setdefault(row["unit_id"], index)
        for row in rows:
            self.assertIn(len(row["source_unit_ids"]), (0, 1, 2))
            self.assertTrue(all(first_by_id[source_id] < first_by_id[row["unit_id"]] for source_id in row["source_unit_ids"]))
        for text, sources in (("the USA", ["the", "USA"]), ("of light", ["of", "light"]), ("could be", ["could", "be"])):
            target = next(row for row in rows if row["english"] == text)
            source_ids = [next(row["unit_id"] for row in rows if row["english"] == source) for source in sources]
            self.assertEqual(target["source_unit_ids"], source_ids)

    def test_internal_punctuation_allows_local_closure_and_keeps_comma(self):
        plan, traces = generate_plan("He smiled, and she laughed.", self.nlp)
        texts = [unit["text"] for unit in plan["sentences"][0]["units"]]
        self.assertIn("He smiled", texts)
        self.assertIn("she laughed", texts)
        self.assertEqual(texts[-1], "He smiled, and she laughed.")
        self.assertIn("smiled, and", texts)
        self.assertIn("He smiled, and", texts)
        self.assertFalse(traces[0]["blocked"])

    def test_adjacency_ignores_hyphens_semicolons_and_whitespace_tokens(self):
        for text, expected_sources in (
            ("The anti-social behaviour stopped.", ["The anti-social behaviour", "stopped"]),
            ("He said no; she left.", ["He said no", "she left"]),
            ("He smiled,\n\nand she laughed.", ["He smiled,\n\nand", "she laughed"]),
        ):
            with self.subTest(text=text):
                plan, traces = generate_plan(text, self.nlp)
                self.assertEqual(len(plan["sentences"]), 1)
                sentence, trace = plan["sentences"][0], traces[0]
                self.assertIsNotNone(trace["sources"][-1])
                self.assertEqual(
                    [sentence["sentence"][slice(*span)] for span in trace["sources"][-1]],
                    expected_sources,
                )
                for unit in sentence["units"]:
                    self.assertEqual(
                        unit["text"],
                        sentence["sentence"][unit["span"]["start"]:unit["span"]["end"]],
                    )

    def test_word_gaps_still_block_unclosed_subtrees(self):
        plan, traces = generate_plan("I bought a book yesterday that explains grammar.", self.nlp)
        texts = [unit["text"] for unit in plan["sentences"][0]["units"]]
        self.assertIn("a book", texts)
        self.assertIn("that explains grammar", texts)
        self.assertNotIn("a book yesterday that explains grammar", texts)
        self.assertNotIn("I bought a book yesterday", texts)
        self.assertIsNone(traces[0]["sources"][-1])
        self.assertIn(
            {"head": "book", "child": "explains", "reason": "与当前片段不相邻"},
            traces[0]["blocked"],
        )
        self.assertIn(
            {"head": "bought", "child": "book", "reason": "子短语未闭合"},
            traces[0]["blocked"],
        )

    def test_double_quotes_are_ignored_by_parser_and_preserved_in_source_spans(self):
        sentence = (
            "Singapore's government said the fines would help create a "
            '"more considerate and pleasant public transport environment"'
        )
        straight, traces = generate_plan(sentence, self.nlp)
        curly_sentence = sentence.replace('"', "“", 1).replace('"', "”")
        curly, curly_traces = generate_plan(curly_sentence, self.nlp)
        self.assertEqual(traces[0]["tree_tokens"], curly_traces[0]["tree_tokens"])
        self.assertEqual(curly["sentences"][0]["units"][-1]["text"], curly_sentence)
        self.assertEqual(_validate_plan(curly, self.nlp), curly)
        planned = straight["sentences"][0]
        self.assertEqual(
            planned["units"][-1]["text"],
            sentence,
        )
        self.assertIn(
            'create a "more considerate and pleasant public transport environment',
            [unit["text"] for unit in planned["units"]],
        )
        target_index = next(
            index for index, unit in enumerate(planned["units"])
            if unit["text"] == 'a "more considerate and pleasant public transport environment'
        )
        source_span = traces[0]["sources"][target_index]
        self.assertEqual(len(source_span), 2)
        self.assertEqual(
            [planned["sentence"][slice(*span)] for span in source_span],
            ["a", "more considerate and pleasant public transport environment"],
        )
        self.assertEqual(planned["sentence"], sentence)
        self.assertTrue(all(token["text"] not in {'"', "“", "”"} for token in traces[0]["tree_tokens"]))
        for unit in planned["units"]:
            start, end = unit["span"]["start"], unit["span"]["end"]
            self.assertEqual(unit["text"], planned["sentence"][start:end])

    def test_quote_projection_keeps_word_boundaries_and_single_quotes(self):
        plan = self.plan('She said"hello"today.')
        self.assertEqual(plan["sentences"][0]["sentence"], 'She said"hello"today.')
        self.assertEqual(plan["sentences"][0]["units"][-1]["text"], 'She said"hello"today.')
        self.assertEqual(
            [unit["text"] for unit in plan["sentences"][0]["units"] if unit["kind"] == "word"],
            ["She", "hello", "today", "said"],
        )
        self.assertEqual(_validate_plan(plan, self.nlp), plan)
        single_quote_sentence = "Singapore's government said 'hello'."
        self.assertEqual(self.plan(single_quote_sentence)["sentences"][0]["sentence"], single_quote_sentence)

    def test_coordination_follows_tree_without_special_grouping(self):
        texts = [unit["text"] for unit in self.plan("He smiled and she laughed.")["sentences"][0]["units"]]
        self.assertIn("smiled and", texts)

    def test_multiple_sentences_keep_independent_units(self):
        plan = self.plan("Dogs bark. Cats sleep!")
        self.assertEqual(len(plan["sentences"]), 2)
        self.assertEqual([sentence["units"][-1]["text"] for sentence in plan["sentences"]], ["Dogs bark.", "Cats sleep!"])

    def test_quoted_sentences_keep_independent_original_boundaries(self):
        for source, expected in (
            ('  "Dogs bark." "Cats sleep!"  ', ['"Dogs bark."', '"Cats sleep!"']),
            ('“Dogs bark.”\n“Cats sleep!”', ['“Dogs bark.”', '“Cats sleep!”']),
            ('"Dogs bark. Cats sleep!"', ['"Dogs bark.', 'Cats sleep!"']),
            ('“Run!”', ['“Run!”']),
            ('"  Dogs bark.  "', ['"  Dogs bark.  "']),
            ('" Dogs bark. " " Cats sleep! "', ['" Dogs bark. "', '" Cats sleep! "']),
            ('“ Dogs bark. ”\n“ Cats sleep! ”', ['“ Dogs bark. ”', '“ Cats sleep! ”']),
        ):
            with self.subTest(source=source):
                plan, traces = generate_plan(source, self.nlp)
                self.assertEqual([sentence["sentence"] for sentence in plan["sentences"]], expected)
                self.assertEqual([sentence["units"][-1]["text"] for sentence in plan["sentences"]], expected)
                self.assertEqual(_validate_plan(plan, self.nlp), plan)
                _, clean_traces = generate_plan(source.translate(str.maketrans('', '', '"“”')), self.nlp)
                self.assertEqual(
                    [trace["tree_tokens"] for trace in traces],
                    [trace["tree_tokens"] for trace in clean_traces],
                )
                for sentence, trace in zip(plan["sentences"], traces, strict=True):
                    _exercise_steps(sentence, trace)
                    for unit in sentence["units"]:
                        self.assertEqual(unit["text"], sentence["sentence"][unit["span"]["start"]:unit["span"]["end"]])

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

        old_algorithm = deepcopy(plan)
        old_algorithm["algorithm_version"] = 6
        with self.assertRaisesRegex(ConfigurationError, "generator versions"):
            _validate_plan(old_algorithm, self.nlp)

        wrong_span = deepcopy(plan)
        wrong_span["sentences"][0]["units"][0]["span"]["start"] += 1
        with self.assertRaisesRegex(ConfigurationError, "does not match"):
            _validate_plan(wrong_span, self.nlp)

        wrong_order = deepcopy(plan)
        wrong_order["sentences"][0]["units"][:2] = reversed(wrong_order["sentences"][0]["units"][:2])
        with self.assertRaisesRegex(ConfigurationError, "do not match"):
            _validate_plan(wrong_order, self.nlp)

    def test_translations_render_to_phraseweave_import_shape(self):
        plan, traces = generate_plan("Birdsong is good.", self.nlp)
        translations = {"sentences": [{"sentence_chinese": "鸟鸣很好。"}]}
        payload = json.loads(render_phraseweave(plan, translations, traces))
        self.assertEqual(payload["schema_version"], 4)
        self.assertEqual(len(payload["statements"]), len(_exercise_steps(plan["sentences"][0], traces[0])))
        self.assertEqual(payload["statements"][-1]["english"], "Birdsong is good.")
        self.assertEqual(set(payload["statements"][0]), {"sentence_chinese", "english", "context_before", "context_after", "unit_id", "source_unit_ids"})

    def test_markdown_and_trace_show_composition_explanations(self):
        plan, traces = generate_plan("the USA grows.", self.nlp)
        prompts = {"sentences": [{"sentence_chinese": "美国在增长。"}]}
        markdown = render_markdown(plan, prompts, traces)
        report = render_trace(traces)
        self.assertIn("| 序号 | 英文答案 | 组合说明 |", markdown)
        self.assertIn("中心词 USA；左接 the", markdown)
        self.assertIn("| 序号 | 学习单元 | 组合说明 |", report)
        self.assertIn("整句", report)

    def test_review_replays_both_direct_sources_in_example_order(self):
        plan, traces = generate_plan(FIRST_SENTENCE + ".", self.nlp)
        sentence = plan["sentences"][0]
        steps = _exercise_steps(sentence, traces[0])
        rows = [(sentence["units"][index]["text"], is_review) for index, is_review in steps]

        for result, sources in (
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
        translations = {"sentences": [{"sentence_chinese": "美国在增长。"}]}
        steps = _exercise_steps(sentence, traces[0])

        markdown = render_markdown(plan, translations, traces)
        self.assertEqual(markdown.count("| 复习 |"), sum(is_review for _, is_review in steps))
        payload = json.loads(render_phraseweave(plan, translations, traces))
        self.assertEqual(payload["schema_version"], 4)
        source_row = next(row for row in payload["statements"] if row["english"] == "the USA")
        source_texts = [
            sentence["units"][int(source_id.split(":")[1])]["text"]
            for source_id in source_row["source_unit_ids"]
        ]
        self.assertEqual(source_texts, ["the", "USA"])
        self.assertEqual(
            [(row["sentence_chinese"], row["english"]) for row in payload["statements"]],
            [("美国在增长。", sentence["units"][index]["text"]) for index, _ in steps],
        )
        rows = [(sentence["units"][index]["text"], is_review) for index, is_review in steps]
        position = rows.index(("the USA", False))
        self.assertEqual(rows[position - 1], ("USA", True))
        self.assertEqual(payload["statements"][0]["source_unit_ids"], [])
        final_source_texts = [
            sentence["units"][int(source_id.split(":")[1])]["text"]
            for source_id in payload["statements"][-1]["source_unit_ids"]
        ]
        self.assertEqual(final_source_texts, ["the USA", "grows"])
        self.assertEqual(
            len(json.loads(render_phraseweave(plan, translations, traces))["statements"]),
            len(steps),
        )

    def test_phraseweave_sources_identify_original_units_across_review_repetitions(self):
        plan, traces = generate_plan(FIRST_SENTENCE + ".", self.nlp)
        sentence = plan["sentences"][0]
        translations = {"sentences": [{"sentence_chinese": "整句提示"}]}
        payload = json.loads(render_phraseweave(plan, translations, traces))
        rows = payload["statements"]
        target = next(row for row in rows if row["english"].endswith("USA say"))
        source_texts = [
            next(row["english"] for row in rows if row["unit_id"] == source_id)
            for source_id in target["source_unit_ids"]
        ]
        self.assertEqual(source_texts, ["Researchers from Tulane University in the USA", "say"])
        self.assertEqual(
            {row["unit_id"] for row in rows if row["english"] == "the USA"},
            {f"0:{next(index for index, unit in enumerate(sentence['units']) if unit['text'] == 'the USA')}"},
        )

    def test_review_replays_actual_sources_across_punctuation(self):
        plan, traces = generate_plan("He smiled, and she laughed.", self.nlp)
        sentence = plan["sentences"][0]
        self.assertEqual(
            [sentence["sentence"][slice(*span)] for span in traces[0]["sources"][-1]],
            ["He smiled, and", "she laughed"],
        )
        rows = [
            (sentence["units"][index]["text"], is_review)
            for index, is_review in _exercise_steps(sentence, traces[0])
        ]
        self.assertEqual(rows[-3:], [
            ("she laughed", True),
            ("He smiled, and", True),
            ("He smiled, and she laughed.", False),
        ])

    def test_penalties_sentence_exports_complete_sources_and_replays_them(self):
        plan, traces = generate_plan(PENALTIES_SENTENCE, self.nlp)
        sentence, trace = plan["sentences"][0], traces[0]
        self.assertEqual(sentence["units"][-1]["text"], PENALTIES_SENTENCE)
        self.assertEqual(sum(unit["kind"] == "sentence" for unit in sentence["units"]), 1)
        self.assertFalse(trace["blocked"])
        expected_sources = ["The new penalties", PENALTIES_SENTENCE.removeprefix("The new penalties ")]
        self.assertEqual(
            [sentence["sentence"][slice(*span)] for span in trace["sources"][-1]],
            expected_sources,
        )
        parsed_tokens = list(self.nlp(PENALTIES_SENTENCE))
        for unit, sources in zip(sentence["units"], trace["sources"], strict=True):
            start, end = unit["span"]["start"], unit["span"]["end"]
            self.assertEqual(unit["text"], sentence["sentence"][start:end])
            if sources is None:
                continue
            # A combination may span punctuation, but its sources must cover every word.
            target_tokens = {
                token.i for token in parsed_tokens
                if not token.is_punct and not token.is_space and start <= token.idx < end
            }
            source_tokens = {
                token.i for token in parsed_tokens
                if not token.is_punct and not token.is_space
                and any(source_start <= token.idx < source_end for source_start, source_end in sources)
            }
            self.assertEqual(source_tokens, target_tokens)

        payload = json.loads(render_phraseweave(plan, {"sentences": [{"sentence_chinese": "整句提示"}]}, traces))
        rows = payload["statements"]
        by_id = {row["unit_id"]: row for row in rows}
        final = rows[-1]
        self.assertEqual(payload["schema_version"], 4)
        self.assertEqual(final["context_before"], "")
        self.assertEqual(final["context_after"], "")
        self.assertEqual([by_id[unit_id]["english"] for unit_id in final["source_unit_ids"]], expected_sources)
        self.assertEqual([row["unit_id"] for row in rows[-3:-1]], final["source_unit_ids"])
        first_by_id = {}
        for index, row in enumerate(rows):
            first_by_id.setdefault(row["unit_id"], index)
            self.assertTrue(all(first_by_id[source_id] < index for source_id in row["source_unit_ids"]))


if __name__ == "__main__":
    unittest_main()
