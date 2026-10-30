import json
from unittest import TestCase

from sentence_review import (practice_spans, punctuation_practice_spans,
                             render_lazy_phraseweave, render_phraseweave,
                             split_sentences, utf16_spans)


class SentenceReviewTests(TestCase):
    def test_rule_index_sentence_examples(self):
        for source, expected in (
            ("Birds sing. Cats sleep?", ["Birds sing.", "Cats sleep?"]),
            ("“Go now?!” She left?", ["“Go now?!”", "She left?"]),
            ("Birds sing\n\nCats sleep", ["Birds sing", "Cats sleep"]),
            ("Dr. Smith paid, e.g. for lunch. Ms. Lee smiled.",
             ["Dr. Smith paid, e.g. for lunch.", "Ms. Lee smiled."]),
            ("He paid 3.14 dollars. She left.",
             ["He paid 3.14 dollars.", "She left."]),
        ):
            with self.subTest(source=source):
                self.assertEqual(split_sentences(source), expected)

    def test_rule_index_punctuation_examples(self):
        for sentence, expected in (
            ("Bring 1,000 books at 12:30; leave.", ["Bring 1,000 books at 12:30", "leave."]),
            ("See https://example.com:8080/a,b; leave.",
             ["See https://example.com:8080/a,b", "leave."]),
            ("Don't split \"well-known\" 3/4 (quoted) – now.", []),
            ("Birds sing.", []),
        ):
            with self.subTest(sentence=sentence):
                spans = punctuation_practice_spans(sentence)
                parts = [sentence[start:end] for start, end in spans[:-1]]
                self.assertEqual(parts, expected)
                self.assertEqual(spans[-1], (0, len(sentence)))

    def test_lazy_export_contains_only_whole_english_sentences(self):
        sentences = ["Read this, then write.", "Birds sing!"]
        payload = json.loads(render_lazy_phraseweave(sentences))
        self.assertEqual(payload["schema_version"], 5)
        self.assertEqual(payload["practice_sequence"], "lazy-comma-segments-v1")
        self.assertEqual([row["english"] for row in payload["statements"]], sentences)
        self.assertTrue(all("sentence_chinese" not in row for row in payload["statements"]))

    def test_splits_punctuation_quotes_and_paragraphs(self):
        source = '“Go now!” She left?\n\nHe stayed.'
        self.assertEqual(split_sentences(source), ['“Go now!”', 'She left?', 'He stayed.'])

    def test_keeps_abbreviations_and_decimals_inside_sentences(self):
        source = 'Dr. Smith paid 3.14 dollars, e.g. for lunch. Ms. Lee smiled.'
        self.assertEqual(split_sentences(source), [
            'Dr. Smith paid 3.14 dollars, e.g. for lunch.',
            'Ms. Lee smiled.',
        ])

    def test_keeps_unpunctuated_text_and_rejects_empty_input(self):
        self.assertEqual(split_sentences('  Birds sing\nsoftly  '), ['Birds sing\nsoftly'])
        with self.assertRaisesRegex(ValueError, 'English text'):
            split_sentences(' \n ')
        with self.assertRaisesRegex(ValueError, 'no word tokens'):
            split_sentences('Birds sing. ...')

    def test_exports_one_compatible_statement_per_sentence(self):
        payload = json.loads(render_phraseweave(['I go.', 'You stay.'], [['我去。'], ['你留下。']]))
        self.assertEqual(payload['schema_version'], 4)
        self.assertEqual(payload['practice_sequence'], 'comma-segments-v1')
        self.assertEqual(len(payload['statements']), 2)
        self.assertEqual(payload['statements'][1], {
            'english': 'You stay.',
            'context_before': '',
            'context_after': '',
            'sentence_chinese': '你留下。',
            'unit_id': '1:0',
            'source_unit_ids': [],
        })

    def test_comma_segments_skip_empty_parts_and_keep_number_commas(self):
        sentence = ', Bring 1,000 books,, ... , then leave, please.'
        self.assertEqual(
            [sentence[start:end] for start, end in practice_spans(sentence)],
            ['Bring 1,000 books', 'then leave', 'please.', sentence],
        )

    def test_new_punctuation_steps_preserve_internal_symbols(self):
        sentence = "A, B; C: D—E."
        self.assertEqual(
            [sentence[start:end] for start, end in punctuation_practice_spans(sentence)],
            ["A", "B", "C", "D", "E.", sentence],
        )
        protected = "Don't split 1,000 at 12:30 or e.g. well-known 3/4 (quoted) – https://example.com:8080/a,b; leave."
        self.assertEqual(
            [protected[start:end] for start, end in punctuation_practice_spans(protected)],
            ["Don't split 1,000 at 12:30 or e.g. well-known 3/4 (quoted) – https://example.com:8080/a,b", "leave.", protected],
        )
        self.assertEqual(punctuation_practice_spans("A; : — B."), [(0, 1), (7, 9), (0, 9)])
        self.assertEqual(
            ["A: B;"[start:end] for start, end in punctuation_practice_spans("A: B;")],
            ["A", "B;", "A: B;"],
        )

    def test_new_spans_use_utf16_offsets(self):
        sentence = "😀 A—B."
        self.assertEqual(utf16_spans(sentence, punctuation_practice_spans(sentence)),
                         [(0, 4), (5, 7), (0, 7)])

    def test_exports_individual_prompts_and_exact_context_then_whole(self):
        sentence = 'Read this, then write, and check.'
        prompts = [['读这个', '然后写', '并检查。', '读这个，然后写，并检查。']]
        rows = json.loads(render_phraseweave([sentence], prompts))['statements']
        self.assertEqual([row['english'] for row in rows], [
            'Read this', 'then write', 'and check.', sentence,
        ])
        self.assertEqual([row['sentence_chinese'] for row in rows], prompts[0])
        self.assertEqual([row['unit_id'] for row in rows], ['0:0', '0:1', '0:2', '0:3'])
        self.assertTrue(all(row['source_unit_ids'] == [] for row in rows))
        self.assertTrue(all(
            row['context_before'] + row['english'] + row['context_after'] == sentence
            for row in rows
        ))
