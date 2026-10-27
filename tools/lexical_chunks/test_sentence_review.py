import json
from unittest import TestCase

from sentence_review import (practice_spans, render_lazy_markdown, render_lazy_phraseweave,
                             render_markdown, render_phraseweave, split_sentences)


class SentenceReviewTests(TestCase):
    def test_lazy_export_contains_only_whole_english_sentences(self):
        sentences = ["Read this, then write.", "Birds sing!"]
        payload = json.loads(render_lazy_phraseweave(sentences))
        self.assertEqual(payload["schema_version"], 5)
        self.assertEqual(payload["practice_sequence"], "lazy-comma-segments-v1")
        self.assertEqual([row["english"] for row in payload["statements"]], sentences)
        self.assertTrue(all("sentence_chinese" not in row for row in payload["statements"]))
        markdown = render_lazy_markdown(sentences)
        self.assertIn("Read this, then write.", markdown)
        self.assertNotIn("### 第", markdown)

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
        self.assertIn('### 第 2 段\n\n中文提示：然后写', render_markdown([sentence], prompts))
