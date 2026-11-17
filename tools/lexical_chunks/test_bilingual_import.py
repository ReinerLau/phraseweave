import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

import local_service
from bilingual_import import parse_chain


class BilingualImportTests(TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        for name, value in [("DATA_DIR", root), ("DATABASE_PATH", root / "test.sqlite3")]:
            replacement = patch.object(local_service, name, value)
            replacement.start()
            self.addCleanup(replacement.stop)
        self.payload = {"requestId": str(uuid.uuid4()), "title": "例句", "text": "kill\n动词：杀死\nKilling him would not be easy\n要杀死他并不容易\nkill\n动词：杀死\n"}

    def test_concurrent_retries_create_one_complete_pack(self):
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda _: local_service.import_chain(self.payload), range(12)))
        self.assertTrue(all(result == results[0] for result in results))
        with local_service._database() as database:
            rows = database.execute("SELECT data FROM course_packs").fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(database.execute("SELECT count(*) FROM course_pack_catalog").fetchone()[0], 1)
            pack = json.loads(rows[0][0])
        statements = pack["courses"][0]["statements"]
        self.assertEqual([s["english"] for s in statements], ["kill", "Killing him would not be easy", "kill"])
        self.assertEqual(len({s["id"] for s in statements}), 3)
        with self.assertRaises(local_service.ImportConflict):
            local_service.import_chain({**self.payload, "title": "different"})

    def test_invalid_input_writes_nothing_and_reports_line(self):
        for text, line in [("kill\n动词：杀死\neasy", "3"), ("kill\n\n", "2")]:
            with self.assertRaisesRegex(ValueError, line):
                local_service.import_chain({**self.payload, "text": text})
        with local_service._database() as database:
            self.assertEqual(database.execute("SELECT count(*) FROM course_packs").fetchone()[0], 0)
            self.assertEqual(database.execute("SELECT count(*) FROM exercise_imports").fetchone()[0], 0)

    def test_fences_crlf_preserve_original_and_order(self):
        self.assertEqual(parse_chain('```text\r\nKilling him would not be easy\r\n要杀死他并不容易\r\n```\r\n'),
                         [{"english": "Killing him would not be easy", "chinese": "要杀死他并不容易"}])

    def test_failed_catalog_write_rolls_back_pack(self):
        with patch.object(local_service, "_save_catalog_entry", side_effect=RuntimeError("failed")):
            with self.assertRaises(RuntimeError):
                local_service.import_chain(self.payload)
        with local_service._database() as database:
            self.assertEqual(database.execute("SELECT count(*) FROM course_packs").fetchone()[0], 0)
        self.assertEqual(local_service.import_chain(self.payload)["count"], 3)
