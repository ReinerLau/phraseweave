# Offline pronunciation hints

`python3 tools/pronunciation/build_dictionary.py` verifies the SHA-256 checksums in
`sources/manifest.json`, then generates the separate client lexicon and its public
license notice. The client build/generate scripts run this automatically. The build
uses only Python's standard library and vendored sources, with no network access.

- CMUdict: `74790861f652b15e4ac49015a90074ad62a27690`, BSD-style license.
- Kyle Gorman's syllabify: `d816db784436e9de87ec1ef9bd11b8e229853710`, MIT license
  embedded at the top of the unchanged source file.
- The dictionary's first pronunciation is used, including for `read` and `lead`.
- The upstream syllabification defaults (including the Alaska rule) are retained.
- Every admitted transcription preserves every ARPAbet phone in order. Unsupported
  words/phones and pronunciations with no vowel nucleus are omitted, not guessed.
- The IPA conversion uses broad US pronunciation, not a phonetic recording. AH0 is
  schwa, ER0 is `ər`; stressed ER is `ɜːr`. Multisyllabic words retain primary and
  secondary stress. Monosyllables omit stress. Length marks on IY/UW follow the
  learner-facing IPA convention used in `computer`.

The generated dictionary contains 124,093 spellings (4,074,151 bytes before HTTP
compression). `fs`, `hm`, `hmm`, `hmmm`, `mm`, `sh`, `shh`, and `ths` are omitted
because the source/algorithm cannot produce a full syllable analysis. Inflected
forms, proper names and source errors are retained; coverage is not teaching accuracy.

The client preloads the independent asset when entering a practice page and does
not need a local service for hints. Installed packages contain the complete asset;
web offline availability follows the existing service worker's resource cache.
If loading fails, answering continues and a later attempt can retry.

Sentence audio is separate: Edge TTS needs a connection for the first synthesis;
persisted local audio plays offline. A dictionary hint is not selected by sentence
meaning and may differ from the TTS voice or its contextual pronunciation.

See `test_dictionary.py` for the 31-word reviewed conversion sample and structural
checks across the entire lexicon. These checks do not claim unique linguistic
syllable boundaries or dictionary equivalence.
