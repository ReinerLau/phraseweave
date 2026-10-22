import json
from unittest import TestCase

from sentence_review import render_phraseweave, split_sentences


class SentenceReviewTests(TestCase):
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
        payload = json.loads(render_phraseweave(['I go.', 'You stay.'], ['我去。', '你留下。']))
        self.assertEqual(payload['schema_version'], 4)
        self.assertEqual(len(payload['statements']), 2)
        self.assertEqual(payload['statements'][1], {
            'english': 'You stay.',
            'context_before': '',
            'context_after': '',
            'sentence_chinese': '你留下。',
            'unit_id': '1:0',
            'source_unit_ids': [],
        })
