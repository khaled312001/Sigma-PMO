# Transcribe the 2026-06-16 meeting video + the 2026-06-17 WhatsApp voice note
# with faster-whisper. Reuses the proven medium/cpu/int8, beam=1, Arabic + VAD
# setup. Streams segments to each transcript file as they complete.
import sys, time, traceback, os, ctypes
from faster_whisper import WhisperModel

CPU_THREADS = max(1, (os.cpu_count() or 4))

JOBS = [
    (
        r"E:\Sigma PMO\qat-wevy-onc (2026-06-16 18_56 GMT+3).mp4",
        r"E:\Sigma PMO\docs\meetings\transcript-2026-06-16-video.txt",
        "Sigma meeting — 2026-06-16 18:56 GMT+3",
    ),
]


def keep_awake():
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)
        print("[power] sleep inhibited for the run", flush=True)
    except Exception as e:
        print(f"[power] could not inhibit sleep: {e}", flush=True)


def hms(s):
    s = int(s)
    return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"


def load():
    attempts = [("medium", "cpu", "int8"), ("small", "cpu", "int8")]
    for name, dev, ct in attempts:
        try:
            print(f"[load] trying {name} on {dev} ({ct}) threads={CPU_THREADS} ...", flush=True)
            m = WhisperModel(name, device=dev, compute_type=ct, cpu_threads=CPU_THREADS)
            print(f"[load] OK: {name} / {dev} / {ct}", flush=True)
            return m, name, dev, ct
        except Exception as e:
            print(f"[load] failed {name}/{dev}/{ct}: {e}", flush=True)
    raise RuntimeError("no model could be loaded")


def transcribe_one(model, name, dev, src, out, title):
    t0 = time.time()
    print(f"\n[run] transcribing {os.path.basename(src)} ...", flush=True)
    segments, info = model.transcribe(
        src,
        language="ar",
        beam_size=1,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )
    print(
        f"[run] detected language: {info.language} (p={info.language_probability:.2f}), "
        f"duration={hms(info.duration)}",
        flush=True,
    )
    with open(out, "w", encoding="utf-8") as f:
        f.write(f"# {title}\n")
        f.write(
            f"# model={name} device={dev} | detected={info.language} "
            f"({info.language_probability:.2f}) | duration={hms(info.duration)}\n\n"
        )
        f.flush()
        n = 0
        for seg in segments:
            f.write(f"[{hms(seg.start)} -> {hms(seg.end)}] {seg.text.strip()}\n")
            f.flush()
            n += 1
            if n % 20 == 0:
                pct = (seg.end / info.duration * 100) if info.duration else 0
                print(
                    f"[progress] {os.path.basename(src)} | {n} seg | "
                    f"{hms(seg.end)}/{hms(info.duration)} ({pct:.0f}%) | elapsed {hms(time.time()-t0)}",
                    flush=True,
                )
        f.write(f"\n# END — {n} segments, elapsed {hms(time.time()-t0)}\n")
    print(f"[done] {n} segments -> {out} in {hms(time.time()-t0)}", flush=True)


def main():
    keep_awake()
    model, name, dev, ct = load()
    for src, out, title in JOBS:
        if not os.path.exists(src):
            print(f"[skip] missing: {src}", flush=True)
            continue
        try:
            transcribe_one(model, name, dev, src, out, title)
        except Exception:
            print(f"[error] failed on {src}", flush=True)
            traceback.print_exc()
    print("\n[all-done]", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
