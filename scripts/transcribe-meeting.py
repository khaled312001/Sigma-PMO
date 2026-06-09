"""
Transcribe the 2026-06-08 Al Ayham meeting MP4 to a Markdown transcript.

Uses faster-whisper (CTranslate2 backend) with the medium model already
cached at ~/.cache/huggingface/hub/models--Systran--faster-whisper-medium.

Output: docs/meetings/2026-06-08-al-ayham-transcript.md
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path("e:/Sigma PMO")
VIDEO = ROOT / "tiw-kbnv-zqv (2026-06-08 21_15 GMT+3).mp4"
AUDIO = ROOT / "scripts" / ".meeting-audio.wav"
OUT_MD = ROOT / "docs" / "meetings" / "2026-06-08-al-ayham-transcript.md"
OUT_MD.parent.mkdir(parents=True, exist_ok=True)


def extract_audio() -> Path:
    """Pull the audio track from the MP4 with moviepy."""
    if AUDIO.exists() and AUDIO.stat().st_size > 0:
        print(f"[skip] audio already extracted: {AUDIO}")
        return AUDIO
    print(f"[step] extracting audio from {VIDEO.name}")
    # moviepy 2.x uses VideoFileClip from moviepy.video; 1.x uses moviepy.editor
    try:
        from moviepy import VideoFileClip  # 2.x
    except ImportError:
        from moviepy.editor import VideoFileClip  # type: ignore  # 1.x
    clip = VideoFileClip(str(VIDEO))
    # Mono 16 kHz is optimal for Whisper and shrinks the file substantially.
    clip.audio.write_audiofile(
        str(AUDIO),
        fps=16000,
        nbytes=2,
        codec="pcm_s16le",
        ffmpeg_params=["-ac", "1"],
        logger=None,
    )
    clip.close()
    sz = AUDIO.stat().st_size / (1024 * 1024)
    print(f"[ok]   audio extracted: {AUDIO.name} ({sz:.1f} MB)")
    return AUDIO


def transcribe() -> None:
    from faster_whisper import WhisperModel

    print("[step] loading faster-whisper 'medium' model (CTranslate2)")
    t0 = time.time()
    # CPU is fine for medium; int8 keeps memory under 1.5 GB.
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    print(f"[ok]   model loaded in {time.time() - t0:.1f}s")

    print("[step] running transcription (language=ar, beam_size=1)")
    t0 = time.time()
    segments, info = model.transcribe(
        str(AUDIO),
        language="ar",
        beam_size=1,
        condition_on_previous_text=False,  # less drift on long files
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    print(f"[ok]   detected language={info.language} duration={info.duration:.0f}s")

    # Stream segments → markdown
    print(f"[step] writing transcript to {OUT_MD}")
    written = 0
    with OUT_MD.open("w", encoding="utf-8") as fh:
        fh.write("# اجتماع 2026-06-08 — تفريغ مكتوب\n\n")
        fh.write(
            f"- **المصدر:** `{VIDEO.name}`\n"
            f"- **المدة الكاملة:** {info.duration / 60:.1f} دقيقة\n"
            f"- **اللغة المكتشفة:** {info.language} "
            f"(احتمال {info.language_probability:.0%})\n"
            f"- **النموذج:** faster-whisper medium (CPU, int8)\n"
            f"- **التفريغ خام تماماً** — أي مراجعة بشرية لاحقة\n\n"
            "---\n\n"
        )
        for seg in segments:
            ts_start = format_ts(seg.start)
            ts_end = format_ts(seg.end)
            line = f"`[{ts_start} → {ts_end}]` {seg.text.strip()}\n\n"
            fh.write(line)
            fh.flush()
            written += 1
            if written % 20 == 0:
                print(f"[live] {written} segments · last={ts_end}", flush=True)

    print(f"[done] transcribed {written} segments in {time.time() - t0:.0f}s")
    print(f"[out]  {OUT_MD}")


def format_ts(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600:02d}:{(s // 60) % 60:02d}:{s % 60:02d}"


if __name__ == "__main__":
    if not VIDEO.exists():
        sys.exit(f"video not found: {VIDEO}")
    extract_audio()
    transcribe()
