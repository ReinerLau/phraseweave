from unittest import TestCase, skipUnless

from model_runtime import model_status, translate_sentences


SOURCE = (
    "The loud music from other passengers on public transport has become a peeve "
    "for many people who want to travel in quiet"
)


@skipUnless(model_status()["model_downloaded"], "Hy-MT2 model is not cached")
class TranslationRegressionTests(TestCase):
    def test_peeve_and_quiet_are_translated_in_context(self):
        chinese = translate_sentences([SOURCE])[0]

        self.assertIn("安静", chinese)
        self.assertTrue(any(word in chinese for word in ("不满", "烦恼", "困扰")))
        self.assertNotIn("隐秘", chinese)
