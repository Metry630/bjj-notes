#!/usr/bin/env python3
"""Transcribe a voice note with Whisper (faster-whisper, CPU, int8). Free per use: it runs inside
the routine's cloud VM. Prints the transcript to stdout and timing to stderr.

    pip install -q faster-whisper     # once per run; the model downloads from huggingface.co
    python3 tools/transcribe.py note.m4a --prompt "spider guard, de la riva, kalo, gw, lu"

--language defaults to "id": his notes mix Indonesian and English, and Whisper in Indonesian mode
keeps English BJJ terms, especially when the prompt lists them. Try --language en if a note is
plainly English.
"""
import argparse
import sys
import time

from faster_whisper import WhisperModel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument("--language", default="id")
    ap.add_argument("--prompt", default="")
    args = ap.parse_args()

    t0 = time.time()
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    t1 = time.time()
    segments, info = model.transcribe(
        args.audio,
        language=args.language or None,
        initial_prompt=args.prompt or None,
        vad_filter=True,
        beam_size=5,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    t2 = time.time()
    print(text)
    print(
        f"model {args.model}: load {t1 - t0:.0f}s, transcribe {t2 - t1:.0f}s for {info.duration:.0f}s of audio",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
