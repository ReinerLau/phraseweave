import json
import unittest

from build_dictionary import OUTPUT, build_dictionary, load_sources, pronunciation_to_ipa

# Reviewed broad-US sample. These are sound syllables, not letter offsets.
EXPECTED = {
    "computer": ["kəm", "ˈpjuː", "tər"],
    "ship": ["ʃɪp"], "night": ["naɪt"], "light": ["laɪt"], "phone": ["foʊn"],
    "cheese": ["tʃiːz"], "through": ["θruː"], "thought": ["θɔːt"],
    "enough": ["ɪ", "ˈnʌf"], "cough": ["kɑːf"], "school": ["skuːl"],
    "action": ["ˈæk", "ʃən"], "nation": ["ˈneɪ", "ʃən"],
    "beautiful": ["ˈbjuː", "tə", "fəl"], "comfortable": ["ˈkʌm", "fər", "tə", "bəl"],
    "necessary": ["ˈnɛ", "sə", "ˌsɛ", "riː"], "rhythm": ["ˈrɪ", "ðəm"],
    "business": ["ˈbɪz", "nəs"], "queue": ["kjuː"], "island": ["ˈaɪ", "lənd"],
    "know": ["noʊ"], "write": ["raɪt"], "make": ["meɪk"], "hope": ["hoʊp"],
    "people": ["ˈpiː", "pəl"], "chocolate": ["ˈtʃɔː", "klət"], "can't": ["kænt"],
    "wanted": ["ˈwɔːn", "tɪd"], "played": ["pleɪd"], "read": ["rɛd"], "lead": ["lɛd"],
}


class DictionaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries, cls.rejected = build_dictionary()

    def test_reviewed_words_and_first_pronunciation(self):
        for word, expected in EXPECTED.items():
            with self.subTest(word=word):
                self.assertEqual(self.entries[word], expected)

    def test_generated_asset_is_reproducible_and_all_entries_are_complete(self):
        self.assertEqual(json.loads(OUTPUT.read_text()), self.entries)
        self.assertGreater(len(self.entries), 120000)
        for word, syllables in self.entries.items():
            self.assertTrue(syllables, word)
            self.assertTrue(all(syllables), word)
        self.assertEqual(set(self.rejected), {"fs", "hm", "hmm", "hmmm", "mm", "sh", "shh", "ths"})

    def test_missing_vowel_and_unknown_phone_are_not_guessed(self):
        syllabify = load_sources()
        with self.assertRaises(ValueError):
            pronunciation_to_ipa(["SH"], syllabify)
        with self.assertRaises(KeyError):
            pronunciation_to_ipa(["UNKNOWN", "AH1"], syllabify)


if __name__ == "__main__":
    unittest.main()
