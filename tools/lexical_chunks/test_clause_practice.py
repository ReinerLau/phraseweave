import json
from unittest import TestCase

from clause_practice import (clause_practice_spans, punctuation_clause_practice_spans,
                             render_clause_phraseweave, _split_parent)
from split_lexical_chunks import load_syntax_model


class ClausePracticeTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()

    def steps(self, sentence):
        spans = clause_practice_spans(sentence, self.nlp)
        encoded = sentence.encode("utf-16-le")
        return [encoded[start * 2:end * 2].decode("utf-16-le") for start, end in spans]

    def test_complement_and_comma_parent_progression(self):
        sentence = "I think that she is right, and I agree."
        self.assertEqual(self.steps(sentence), [
            "I think", "that she is right", "I think that she is right",
            "and I agree.", sentence,
        ])

    def test_embedded_relative_and_adverbial_clauses(self):
        self.assertEqual(self.steps("The book that I bought is good."), [
            "The book", "that I bought", "is good.", "The book that I bought is good.",
        ])
        self.assertEqual(self.steps("I stayed because it rained."), [
            "I stayed", "because it rained", "I stayed because it rained.",
        ])

    def test_nested_clauses_and_numeric_comma(self):
        sentence = "I know that she said that he left."
        self.assertEqual(self.steps(sentence), [
            "I know", "that she said", "that he left",
            "that she said that he left", sentence,
        ])
        sentence = "Bring 1,000 books, then leave."
        self.assertEqual(self.steps(sentence), ["Bring 1,000 books", "then leave.", sentence])

    def test_unsplit_sentence_and_utf16_offsets(self):
        self.assertEqual(self.steps("Birds sing."), ["Birds sing."])
        sentence = "😀 I think that she is right."
        spans = clause_practice_spans(sentence, self.nlp)
        self.assertEqual(spans[-1], (0, len(sentence.encode("utf-16-le")) // 2))
        self.assertEqual(self.steps(sentence)[-1], sentence)

    def test_export_carries_the_same_ordered_spans(self):
        sentence = "I think that she is right."
        spans = clause_practice_spans(sentence, self.nlp)
        payload = json.loads(render_clause_phraseweave([sentence], [spans]))
        self.assertEqual(payload["schema_version"], 6)
        self.assertEqual(payload["practice_sequence"], "lazy-clause-segments-v1")
        self.assertEqual(payload["statements"][0]["practice_spans"], [list(span) for span in spans])

    def test_new_clause_steps_use_punctuation_parents(self):
        sentence = "I think that she is right; then I agree."
        spans = punctuation_clause_practice_spans(sentence, self.nlp)
        encoded = sentence.encode("utf-16-le")
        steps = [encoded[start * 2:end * 2].decode("utf-16-le") for start, end in spans]
        self.assertEqual(steps, [
            "I think", "that she is right", "I think that she is right",
            "then I agree.", sentence,
        ])

    def test_crossing_or_out_of_parent_clause_candidates_do_not_split(self):
        sentence = "Alpha beta gamma delta."
        parent = (0, len(sentence))
        self.assertEqual(_split_parent(sentence, parent, [(0, 10), (6, 16)]), [parent])
        self.assertEqual(_split_parent(sentence, parent, [(0, len(sentence) + 1)]), [parent])
