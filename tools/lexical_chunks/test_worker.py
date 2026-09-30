from datetime import datetime, timezone
from unittest import TestCase
from unittest import main as unittest_main

from worker import _build_outputs


class InMemoryOutputTests(TestCase):
    def setUp(self):
        self.created_at = datetime(2026, 9, 30, 6, 30, 12, 123456, tzinfo=timezone.utc)

    def test_both_exports_share_a_timestamped_name_and_include_content(self):
        outputs = _build_outputs("# Markdown", '{"schema_version":4}', "standard", "both", self.created_at)

        self.assertEqual(
            outputs,
            [
                {
                    "name": "text.learning-units-20260930T063012123456Z.md",
                    "content": "# Markdown",
                },
                {
                    "name": "text.learning-units-20260930T063012123456Z.json",
                    "content": '{"schema_version":4}',
                },
            ],
        )

    def test_review_markdown_export_only_contains_requested_format(self):
        outputs = _build_outputs("# Review", "unused", "review", "markdown", self.created_at)

        self.assertEqual(
            outputs,
            [
                {
                    "name": "text.review.learning-units-20260930T063012123456Z.md",
                    "content": "# Review",
                }
            ],
        )

    def test_phraseweave_export_only_contains_requested_format(self):
        outputs = _build_outputs("unused", '{"schema_version":4}', "standard", "phraseweave", self.created_at)

        self.assertEqual(
            outputs,
            [
                {
                    "name": "text.learning-units-20260930T063012123456Z.json",
                    "content": '{"schema_version":4}',
                }
            ],
        )


if __name__ == "__main__":
    unittest_main()
