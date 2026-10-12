"""Small isolated edge-tts process; writes only MP3 bytes to stdout."""

import asyncio
import json
import sys


async def generate(payload: dict) -> None:
    import edge_tts

    audio = bytearray()
    communicate = edge_tts.Communicate(payload["text"], payload["voice"], rate=payload["rate"])
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    if not audio:
        raise RuntimeError("No audio received")
    sys.stdout.buffer.write(audio)


def main() -> int:
    try:
        asyncio.run(generate(json.load(sys.stdin)))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
