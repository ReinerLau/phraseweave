from unittest import TestCase

from fronted_practice import fronted_adjunct_practice_spans
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
            "time marched on", "indifferent to my concerns", "and soon enough",
            "another month had passed.", "and soon enough another month had passed.",
            sentence,
        ])

    def test_fronted_place_time_and_condition_keep_the_core_clause_together(self):
        self.assertEqual(self.steps("In the morning she left."), [
            "In the morning", "she left.", "In the morning she left.",
        ])
        self.assertEqual(self.steps("In the morning she left; at night he returned."), [
            "In the morning", "she left", "In the morning she left",
            "at night", "he returned.", "at night he returned.",
            "In the morning she left; at night he returned.",
        ])
        self.assertEqual(self.steps("If it rains we will stay."), [
            "If it rains", "we will stay.", "If it rains we will stay.",
        ])
        self.assertEqual(self.steps("Yesterday in the morning we left."), [
            "Yesterday in the morning", "we left.", "Yesterday in the morning we left.",
        ])

    def test_connective_only_and_mid_clause_modifiers_do_not_split(self):
        self.assertEqual(self.steps("And another month had passed."),
                         ["And another month had passed."])
        self.assertEqual(self.steps("She quietly left."), ["She quietly left."])
        self.assertEqual(self.steps("Birds sing."), ["Birds sing."])

    def test_subordinate_subject_is_not_mistaken_for_the_core_subject(self):
        self.assertEqual(self.steps("When the sun rose the birds sang."), [
            "When the sun rose", "the birds sang.", "When the sun rose the birds sang.",
        ])

    def test_unreliable_prefix_remains_whole_and_utf16_offsets_are_preserved(self):
        self.assertEqual(self.steps("😀 And then she left."), ["😀 And then she left."])
        sentence = "😀 Hi; And then she left."
        spans = fronted_adjunct_practice_spans(sentence, self.nlp)
        self.assertEqual(self.steps(sentence), [
            "😀 Hi", "And then", "she left.", "And then she left.", sentence,
        ])
        self.assertEqual(spans[1], (7, 15))
        self.assertEqual(spans[-1], (0, len(sentence.encode("utf-16-le")) // 2))
