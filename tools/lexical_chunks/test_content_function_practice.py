from types import SimpleNamespace
from unittest import TestCase

from content_function_practice import build_practice_steps, preview_step
from sentence_review import punctuation_practice_spans, utf16_spans
from split_lexical_chunks import load_syntax_model


def model(*parts):
    def parse(_sentence):
        return [SimpleNamespace(text=text, idx=start, pos_=pos, is_punct=False, is_space=False)
                for text, start, pos in parts]
    return parse


class ContentFunctionPracticeTests(TestCase):
    def test_uppercase_all_content_segment_is_replayed_before_next_segment(self):
        sentence = (
            "TIME MARCHED ON, indifferent to my concerns; "
            "and soon enough another month had passed."
        )
        spans = utf16_spans(sentence, punctuation_practice_spans(sentence))
        steps = build_practice_steps(sentence, spans, load_syntax_model())
        labels = [preview_step(sentence, step) for step in steps]
        self.assertEqual(labels[:4], [
            "实义词：TIME", "实义词：MARCHED", "实义词：ON",
            "组合片段：TIME MARCHED ON",
        ])

    def test_content_words_then_one_function_fill_then_whole(self):
        sentence = "She put the book on the table."
        nlp = model(("She", 0, "PRON"), ("put", 4, "VERB"), ("the", 8, "DET"),
                    ("book", 12, "NOUN"), ("on", 17, "ADP"), ("the", 20, "DET"),
                    ("table", 24, "NOUN"))
        steps = build_practice_steps(sentence, [[0, len(sentence)]], nlp)
        self.assertEqual([step["kind"] for step in steps],
                         ["content-word"] * 3 + ["function-fill", "sentence"])
        self.assertEqual([preview_step(sentence, step) for step in steps[:4]], [
            "实义词：put", "实义词：book", "实义词：table",
            "功能词填空：___ put ___ book ___ ___ table.",
        ])
        self.assertEqual(steps[3]["answer_word_indices"], [0, 2, 4, 5])

    def test_skips_fill_without_function_words_and_replays_segment_without_content(self):
        sentence = "Birds sing, and I."
        spans = utf16_spans(sentence, [(0, 10), (12, 18), (0, 18)])
        nlp = model(("Birds", 0, "NOUN"), ("sing", 6, "VERB"),
                    ("and", 12, "CCONJ"), ("I", 16, "PRON"))
        steps = build_practice_steps(sentence, spans, nlp)
        self.assertEqual([step["kind"] for step in steps],
                         ["content-word", "content-word", "segment", "segment", "sentence"])

    def test_contractions_remain_one_editable_word_and_utf16_offsets_survive_emoji(self):
        sentence = "🙂 John's book isn't here."
        nlp = model(("John", 2, "PROPN"), ("'s", 6, "PART"),
                    ("book", 9, "NOUN"), ("is", 14, "AUX"), ("n't", 16, "PART"),
                    ("here", 20, "ADV"))
        spans = utf16_spans(sentence, [(0, len(sentence))])
        steps = build_practice_steps(sentence, spans, nlp)
        self.assertEqual([preview_step(sentence, step) for step in steps[:3]],
                         ["实义词：John's", "实义词：book", "实义词：here"])
        self.assertEqual(steps[0]["span"], [3, 9])
        self.assertEqual(steps[3]["answer_word_indices"], [0, 3])

    def test_clause_parent_is_replayed_after_leaf_drills(self):
        sentence = "I think that she is right."
        spans = utf16_spans(sentence, [(0, 7), (8, 25), (0, 26)])
        nlp = model(("I", 0, "PRON"), ("think", 2, "VERB"),
                    ("that", 8, "SCONJ"), ("she", 13, "PRON"),
                    ("is", 17, "AUX"), ("right", 20, "ADJ"))
        steps = build_practice_steps(sentence, spans, nlp)
        self.assertEqual([step["kind"] for step in steps],
                         ["content-word", "function-fill", "segment", "content-word",
                          "function-fill", "segment", "sentence"])
