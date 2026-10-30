from unittest import TestCase

from dependency_practice import (
    build_dependency_practice, build_dependency_steps, preview_dependency_step,
)
from split_lexical_chunks import load_syntax_model


class DependencyPracticeTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()

    def segments(self, sentence):
        steps = build_dependency_steps(sentence, self.nlp(sentence))
        return [preview_dependency_step(sentence, step).split("：", 1)[1]
                for step in steps if step["kind"] in {"segment", "sentence"}]

    def labeled_segments(self, sentence):
        practice = build_dependency_practice(sentence, self.nlp(sentence))
        return [preview_dependency_step(sentence, step, label)
                for step, label in zip(practice.steps, practice.preview_labels, strict=True)
                if step["kind"] in {"segment", "sentence"}]

    def test_object_and_nested_preposition_object(self):
        sentence = "we’d finished the project in only three months."
        self.assertEqual(self.segments(sentence), [
            "we’d finished", "the project", "we’d finished the project",
            "only three months", "in only three months", sentence,
        ])
        steps = build_dependency_steps(sentence, self.nlp(sentence))
        self.assertFalse(any(step.get("text", "").startswith("’d") for step in steps))
        self.assertEqual(self.labeled_segments(sentence), [
            "主谓：we’d finished", "宾语：the project",
            "接入宾语：we’d finished the project", "宾语：only three months",
            "状语：in only three months", f"整句：{sentence}",
        ])

    def test_preview_names_preposition_by_its_sentence_role(self):
        sentence = "Somehow, we’d finished the project in only three months."
        labels = self.labeled_segments(sentence)
        self.assertIn("宾语：only three months", labels)
        self.assertIn("状语：in only three months", labels)
        self.assertIn("接入状语：we’d finished the project in only three months", labels)
        self.assertFalse(any(label.startswith(("介词宾语：", "介词短语："))
                             for label in labels))

    def test_noun_of_phrases_remain_whole(self):
        for sentence, noun_phrase in [
            ("I spent a lot of money.", "a lot of money"),
            ("She bought a cup of coffee.", "a cup of coffee"),
            ("I read the end of the story.", "the end of the story"),
            ("I’d thrown a lot of money at it near the end, hiring additional workers to cover the more monotonous tasks, which had definitely sped things up.", "a lot of money"),
        ]:
            with self.subTest(sentence=sentence):
                practice = build_dependency_practice(sentence, self.nlp(sentence))
                segments = [step.get("text", "") for step in practice.steps if step["kind"] == "segment"]
                self.assertIn(noun_phrase, segments)
                self.assertFalse(any(text.startswith("of ") for text in segments))
                words = [sentence[step["span"][0]:step["span"][1]]
                         for step in practice.steps if step["kind"] == "content-word"]
                self.assertIn(noun_phrase.split()[-1], words)

    def test_other_noun_prepositions_remain_detachable(self):
        self.assertIn("on the table", self.segments("She opened the box on the table."))

    def test_detaches_purpose_when_subtree_extends_past_comma(self):
        sentence = ("I’d thrown a lot of money at it near the end, hiring additional "
                    "workers to cover the more monotonous tasks, which had definitely "
                    "sped things up.")
        segments = self.segments(sentence)
        hiring = segments.index("hiring additional workers")
        cover = segments.index("to cover the more monotonous tasks")
        combined = segments.index("hiring additional workers to cover the more monotonous tasks")
        self.assertLess(hiring, cover)
        self.assertLess(cover, combined)
        self.assertNotIn("hiring to cover the more monotonous tasks", segments)

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
        self.assertEqual(self.labeled_segments(sentence), [
            "主语：She", "谓语：finished", "主谓：She finished", "状语：quietly",
            "接入状语：She quietly finished", "宾语：the project", f"整句：{sentence}",
        ])

    def test_double_object_and_embedded_clause(self):
        self.assertEqual(self.segments("She gave him the book."), [
            "She", "gave", "She gave", "him", "She gave him", "the book",
            "She gave him the book.",
        ])
        self.assertEqual(self.labeled_segments("She gave him the book."), [
            "主语：She", "谓语：gave", "主谓：She gave", "宾语：him",
            "接入宾语：She gave him", "宾语：the book", "整句：She gave him the book.",
        ])
        sentence = "She took the project that we had finished in three months."
        segments = self.segments(sentence)
        self.assertLess(segments.index("we had finished"), segments.index("that we had finished"))
        self.assertLess(segments.index("three months"), segments.index("in three months"))
        self.assertLess(segments.index("the project that we had finished in three months"),
                        segments.index(sentence))
        labeled = self.labeled_segments(sentence)
        self.assertIn("主谓：we had finished", labeled)
        self.assertIn("宾语：three months", labeled)
        self.assertIn("状语：in three months", labeled)
        self.assertIn("定语：that we had finished in three months", labeled)
        self.assertIn("宾语：the project that we had finished in three months", labeled)

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
        self.assertEqual(self.labeled_segments(sentence)[0], "片段：😀 Hi")
