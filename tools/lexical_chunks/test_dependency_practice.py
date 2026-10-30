from unittest import TestCase

from dependency_practice import build_dependency_steps, preview_dependency_step
from split_lexical_chunks import load_syntax_model


class DependencyPracticeTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()

    def segments(self, sentence):
        steps = build_dependency_steps(sentence, self.nlp(sentence))
        return [preview_dependency_step(sentence, step).split("：", 1)[1]
                for step in steps if step["kind"] in {"segment", "sentence"}]

    def test_object_and_nested_preposition_object(self):
        sentence = "we’d finished the project in only three months."
        self.assertEqual(self.segments(sentence), [
            "we’d finished", "the project", "we’d finished the project",
            "only three months", "in only three months", sentence,
        ])
        steps = build_dependency_steps(sentence, self.nlp(sentence))
        self.assertFalse(any(step.get("text", "").startswith("’d") for step in steps))

    def test_intervening_adjunct_builds_discontinuous_core(self):
        sentence = "She quietly finished the project."
        self.assertEqual(self.segments(sentence), [
            "She", "finished", "She finished", "quietly", "She quietly finished",
            "the project", sentence,
        ])
        step = next(step for step in build_dependency_steps(sentence, self.nlp(sentence))
                    if step.get("text") == "She finished")
        self.assertEqual(step, {"kind": "segment", "text": "She finished"})
        self.assertTrue(all(set(step) == {"kind", "text"}
                            for step in build_dependency_steps(sentence, self.nlp(sentence))
                            if step["kind"] == "segment"))

    def test_double_object_and_embedded_clause(self):
        self.assertEqual(self.segments("She gave him the book."), [
            "She", "gave", "She gave", "him", "She gave him", "the book",
            "She gave him the book.",
        ])
        sentence = "She took the project that we had finished in three months."
        segments = self.segments(sentence)
        self.assertLess(segments.index("we had finished"), segments.index("that we had finished"))
        self.assertLess(segments.index("three months"), segments.index("in three months"))
        self.assertLess(segments.index("the project that we had finished in three months"),
                        segments.index(sentence))

    def test_single_word_sentence_keeps_its_content_drill(self):
        sentence = "Run."
        steps = build_dependency_steps(sentence, self.nlp(sentence))
        self.assertEqual([step["kind"] for step in steps],
                         ["content-word", "segment", "sentence"])

    def test_utf16_ranges_and_punctuation_fallback(self):
        sentence = "😀 Hi; She quietly left."
        steps = build_dependency_steps(sentence, self.nlp(sentence))
        self.assertEqual(steps[-1], {
            "kind": "sentence", "span": [0, len(sentence.encode("utf-16-le")) // 2],
        })
        self.assertIn("She left", self.segments(sentence))
        self.assertEqual(next(step for step in steps if step.get("text") == "She left"),
                         {"kind": "segment", "text": "She left"})
