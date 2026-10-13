"""Opt-in real inference check; run after model setup, with external networking denied.

PHRASEWEAVE_TEST_KOKORO=1 PYTHONPATH=tools/lexical_chunks <runtime-python> -m unittest test_tts_integration
On macOS prepend: sandbox-exec -p '(version 1)(allow default)(deny network*)'
"""

import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from unittest import TestCase, main, skipUnless

from tts import AudioCache, KokoroRuntime
from tts_worker import MODEL_DIR, MODEL_FILES


@skipUnless(os.environ.get("PHRASEWEAVE_TEST_KOKORO") == "1", "Opt-in local Kokoro model test")
class OfflineKokoroTests(TestCase):
    def test_uncached_words_longest_sentence_and_cache_survive_offline_restart(self):
        self.assertTrue(all((MODEL_DIR / name).is_file() for name in MODEL_FILES))
        with TemporaryDirectory() as directory:
            runtime = KokoroRuntime(Path(sys.executable))
            self.addCleanup(runtime.close)
            def start():
                runtime.start()
                deadline = time.monotonic() + 60
                while runtime.status()["state"] not in ("ready", "error"):
                    self.assertLess(time.monotonic(), deadline)
                    time.sleep(.1)
                self.assertEqual(runtime.status()["state"], "ready", runtime.status())
            def verify_mp3(audio, label):
                output = Path(directory) / f"{label}.mp3"
                output.write_bytes(audio)
                probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                                        "-show_entries", "stream=codec_name,sample_rate,duration",
                                        "-of", "json", str(output)], capture_output=True, check=True)
                import json
                stream = json.loads(probe.stdout)["streams"][0]
                self.assertEqual(stream["codec_name"], "mp3")
                self.assertEqual(stream["sample_rate"], "24000")
                self.assertGreater(float(stream["duration"]), 0)
                print(label, len(audio), "bytes", stream["duration"], "seconds", flush=True)
            start()
            cache = AudioCache(Path(directory) / "cache", runtime.synthesize,
                               lambda text: runtime.synthesize(text, kind="sentence"))
            for word in ("computer", "don't", "unpredictability"):
                begin = time.monotonic()
                audio = cache.get(word)
                verify_mp3(audio, word)
                self.assertEqual(cache.get(word), audio)
                print("latency", round(time.monotonic() - begin, 2), flush=True)
            text = ("I practice English every day, and I enjoy learning new expressions. " * 31)[:2000]
            self.assertEqual(len(text), 2000)
            begin = time.monotonic()
            verify_mp3(cache.get(text, "sentence"), "longest-sentence")
            print("sentence latency", round(time.monotonic() - begin, 2), flush=True)
            runtime.close()
            runtime = KokoroRuntime(Path(sys.executable))
            self.addCleanup(runtime.close)
            start()
            cache = AudioCache(Path(directory) / "cache", runtime.synthesize)
            self.assertTrue(cache.get("computer"))
            verify_mp3(cache.get("freshly"), "new-word-after-restart")
            cache.clear()
            self.assertFalse(list(cache.directory.glob("*.mp3")))
            self.assertTrue(all((MODEL_DIR / name).is_file() for name in MODEL_FILES))
            verify_mp3(cache.get("computer"), "regenerated-after-clear")


if __name__ == "__main__":
    main()
