from unittest import TestCase

from fronted_practice import fronted_adjunct_practice_spans, syntactic_practice_spans
from split_lexical_chunks import load_syntax_model


class FrontedAdjunctPracticeTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()

    def steps(self, sentence):
        encoded = sentence.encode("utf-16-le")
        return [encoded[start * 2:end * 2].decode("utf-16-le")
                for start, end in fronted_adjunct_practice_spans(sentence, self.nlp)]

    def test_fronted_time_modifier_replays_its_punctuation_parent(self):
        sentence = "time marched on, indifferent to my concerns; and soon enough another month had passed."
        self.assertEqual(self.steps(sentence), [
            "time marched on", "indifferent to my concerns",
            "another month had passed.", "and soon enough", "and soon enough another month had passed.",
            sentence,
        ])

    def test_fronted_place_and_time_keep_the_core_clause_together(self):
        self.assertEqual(self.steps("In the morning she left."), [
            "she left.", "In the morning", "In the morning she left.",
        ])
        self.assertEqual(self.steps("In the morning she left; at night he returned."), [
            "she left", "In the morning", "In the morning she left",
            "he returned.", "at night", "at night he returned.",
            "In the morning she left; at night he returned.",
        ])
        self.assertEqual(self.steps("Yesterday in the morning we left."), [
            "we left.", "Yesterday in the morning", "Yesterday in the morning we left.",
        ])

    def test_fronted_clauses_remain_whole(self):
        self.assertEqual(self.steps("If it rains we will stay."),
                         ["If it rains we will stay."])
        self.assertEqual(self.steps("When the sun rose the birds sang."),
                         ["When the sun rose the birds sang."])

    def test_connective_only_and_mid_clause_modifiers_do_not_split(self):
        self.assertEqual(self.steps("And another month had passed."),
                         ["And another month had passed."])
        self.assertEqual(self.steps("She quietly left."), ["She quietly left."])
        self.assertEqual(self.steps("Birds sing."), ["Birds sing."])

    def test_unreliable_prefix_remains_whole_and_utf16_offsets_are_preserved(self):
        self.assertEqual(self.steps("😀 And then she left."), ["😀 And then she left."])
        sentence = "😀 Hi; And then she left."
        spans = fronted_adjunct_practice_spans(sentence, self.nlp)
        self.assertEqual(self.steps(sentence), [
            "😀 Hi", "she left.", "And then", "And then she left.", sentence,
        ])
        self.assertEqual(spans[2], (7, 15))
        self.assertEqual(spans[-1], (0, len(sentence.encode("utf-16-le")) // 2))


class SyntacticPracticeTests(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = load_syntax_model()

    def steps(self, sentence):
        encoded = sentence.encode("utf-16-le")
        return [encoded[start * 2:end * 2].decode("utf-16-le")
                for start, end in syntactic_practice_spans(sentence, self.nlp(sentence))]

    def test_subject_predicate_core_precedes_the_whole_sentence(self):
        sentence = "The Magic Armor Mark One was now complete."
        self.assertEqual(self.steps(sentence), [
            "The Magic Armor Mark One", "was now complete.", sentence,
        ])
        self.assertEqual(self.steps("Birds sing."), ["Birds", "sing.", "Birds sing."])
        self.assertEqual(self.steps("The cat and dog slept."), [
            "The cat and dog", "slept.", "The cat and dog slept.",
        ])

    def test_fronted_adjunct_wraps_a_subject_predicate_core(self):
        sentence = "In the morning she left."
        self.assertEqual(self.steps(sentence), [
            "she", "left.", "she left.", "In the morning", sentence,
        ])
        self.assertNotIn("In the morning she", self.steps(sentence))

    def test_punctuation_parents_replay_after_their_syntax_children(self):
        sentence = "In the morning she left; at night he returned."
        self.assertEqual(self.steps(sentence), [
            "she", "left", "she left", "In the morning", "In the morning she left",
            "he", "returned.", "he returned.", "at night", "at night he returned.",
            sentence,
        ])

    def test_unreliable_or_absent_nominal_subject_is_not_split(self):
        for sentence in (
            "If it rains we will stay.", "There is a problem.",
            "Open the door.", "Did she leave?", "And another month had passed.",
        ):
            with self.subTest(sentence=sentence):
                self.assertEqual(self.steps(sentence), [sentence])

    def test_utf16_offsets_are_preserved_after_punctuation(self):
        sentence = "😀 Hi; In the morning she left."
        spans = syntactic_practice_spans(sentence, self.nlp(sentence))
        self.assertEqual(self.steps(sentence), [
            "😀 Hi", "she", "left.", "she left.", "In the morning",
            "In the morning she left.", sentence,
        ])
        self.assertEqual(spans[1], (22, 25))
        self.assertEqual(spans[-1], (0, len(sentence.encode("utf-16-le")) // 2))
