"""Resident CPU Kokoro worker. Stdout is exclusively newline-delimited JSON."""

from __future__ import annotations

import base64
from contextlib import redirect_stdout
import json
import os
from pathlib import Path
import sys
import traceback
from types import SimpleNamespace

from tts import MODEL_ID, MODEL_REVISION, RATE, VOICE

MODEL_DIR = Path.home() / ".cache" / "phraseweave" / "lexical-chunks" / "kokoro" / MODEL_REVISION
MODEL_FILES = ("config.json", "kokoro-v1_0.pth", f"voices/{VOICE}.pt")


class ModelDownloadError(RuntimeError):
    pass


def emit(**record) -> None:
    print(json.dumps(record, ensure_ascii=False), flush=True)


def prepare():
    if not all((MODEL_DIR / name).is_file() for name in MODEL_FILES):
        emit(state="downloading", message="正在下载朗读模型（约 328 MB），首次使用需要联网…")
        with redirect_stdout(sys.stderr):
            try:
                from huggingface_hub import snapshot_download
                snapshot_download(repo_id=MODEL_ID, revision=MODEL_REVISION,
                                  local_dir=MODEL_DIR, allow_patterns=list(MODEL_FILES))
            except Exception as error:
                raise ModelDownloadError("Pinned Kokoro model download failed") from error
    # Passing local files is not enough: guard every library's lazy download too.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    # The download may already have imported the Hub's environment constants.
    from huggingface_hub import constants as hub_constants
    hub_constants.HF_HUB_OFFLINE = True
    emit(state="loading", message="正在加载本地朗读模型…")
    with redirect_stdout(sys.stderr):
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        from misaki import en, espeak
        from kokoro import KModel, KPipeline
        import spacy
        import torch

        if not spacy.util.is_package("en_core_web_sm"):
            raise RuntimeError("The bundled English spaCy model is missing")
        torch.set_num_threads(max(1, min(os.cpu_count() or 1, 4)))
        fallback = espeak.EspeakFallback(british=False)
        # Fail setup if phonemization isn't available, rather than silently omit words.
        phonemes, _ = fallback(SimpleNamespace(text="computer"))
        if not phonemes:
            raise RuntimeError("Local eSpeak phonemization is unavailable")
        g2p = en.G2P(trf=False, british=False, fallback=fallback, unk="")
        model = KModel(repo_id=MODEL_ID, config=str(MODEL_DIR / "config.json"),
                       model=str(MODEL_DIR / "kokoro-v1_0.pth")).to("cpu").eval()
        pipeline = KPipeline(lang_code="a", repo_id=MODEL_ID, model=model)
        pipeline.g2p = g2p
        voice = torch.load(MODEL_DIR / f"voices/{VOICE}.pt", map_location="cpu", weights_only=True)
        # Warm up inference and encoding before declaring readiness.
        encode(pipeline, voice, "Ready.")
    return pipeline, voice


def encode(pipeline, voice, text: str) -> bytes:
    import lameenc
    import numpy as np
    import torch

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(128)
    encoder.set_in_sample_rate(24000)
    encoder.set_channels(1)
    encoder.set_quality(2)
    audio = bytearray()
    sample_count = 0
    with torch.inference_mode():
        for result in pipeline(text, voice=voice, speed=RATE):
            if result.audio is None:
                raise RuntimeError("Kokoro returned no audio")
            samples = result.audio.detach().cpu().numpy()
            sample_count += samples.size
            pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
            audio.extend(encoder.encode(pcm))
    if not sample_count:
        raise RuntimeError("Kokoro returned empty audio")
    audio.extend(encoder.flush())
    if not audio:
        raise RuntimeError("Kokoro returned empty audio")
    return bytes(audio)


def main() -> int:
    try:
        pipeline, voice = prepare()
    except ModelDownloadError:
        traceback.print_exc(file=sys.stderr)
        emit(state="error", message="朗读模型下载失败，请在声音设置中重试。")
        return 1
    except Exception:
        traceback.print_exc(file=sys.stderr)
        emit(state="error", message="朗读模型加载失败，请在声音设置中重试。")
        return 1
    emit(state="ready", message="本地朗读已就绪，可离线使用。")
    for line in sys.stdin:
        try:
            text = json.loads(line)["text"]
            with redirect_stdout(sys.stderr):
                audio = encode(pipeline, voice, text)
            emit(audio=base64.b64encode(audio).decode("ascii"))
        except Exception:
            traceback.print_exc(file=sys.stderr)
            emit(state="error", message="本地朗读生成失败，请在声音设置中重试。")
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
