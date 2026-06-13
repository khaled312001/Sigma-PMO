# Transcribe the Sigma meeting video with faster-whisper (GPU if available).
# Streams segments to a transcript file as they complete so progress is visible.
import sys, time, traceback, os, ctypes
from faster_whisper import WhisperModel

CPU_THREADS = max(1, (os.cpu_count() or 4))

def keep_awake():
    # Prevent Windows from sleeping while the long transcription runs, without
    # changing the user's power settings. ES_CONTINUOUS | ES_SYSTEM_REQUIRED.
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)
        print("[power] sleep inhibited for the run", flush=True)
    except Exception as e:
        print(f"[power] could not inhibit sleep: {e}", flush=True)

VIDEO = r"E:\Sigma PMO\eiw-ibfq-pgz (2026-06-12 18_49 GMT+3).mp4"
OUT = r"E:\Sigma PMO\docs\meetings\transcript-2026-06-12.txt"

def hms(s):
    s = int(s); return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"

def load():
    # Try GPU large-v3 first, then progressively cheaper fallbacks.
    # GPU is an MX130 (2GB) — too small for medium/large in float32, and it only
    # supports float32 compute. So CPU int8 with all cores is the realistic path.
    attempts = [
        ("medium",   "cpu",  "int8"),
        ("small",    "cpu",  "int8"),
    ]
    for name, dev, ct in attempts:
        try:
            print(f"[load] trying {name} on {dev} ({ct}) threads={CPU_THREADS} ...", flush=True)
            m = WhisperModel(name, device=dev, compute_type=ct, cpu_threads=CPU_THREADS)
            print(f"[load] OK: {name} / {dev} / {ct}", flush=True)
            return m, name, dev, ct
        except Exception as e:
            print(f"[load] failed {name}/{dev}/{ct}: {e}", flush=True)
    raise RuntimeError("no model could be loaded")

def main():
    t0 = time.time()
    keep_awake()
    model, name, dev, ct = load()
    print(f"[run] transcribing (model={name}, device={dev}, beam=1)...", flush=True)
    segments, info = model.transcribe(
        VIDEO,
        language="ar",          # detected ar @0.96 — skip re-detection
        beam_size=1,            # greedy: ~3-5x faster than beam=5, minimal accuracy loss
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )
    print(f"[run] detected language: {info.language} (p={info.language_probability:.2f}), "
          f"duration={hms(info.duration)}", flush=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(f"# Sigma meeting transcript — 2026-06-12 18:49 GMT+3\n")
        f.write(f"# model={name} device={dev} | detected={info.language} "
                f"({info.language_probability:.2f}) | duration={hms(info.duration)}\n\n")
        f.flush()
        n = 0
        for seg in segments:
            line = f"[{hms(seg.start)} -> {hms(seg.end)}] {seg.text.strip()}\n"
            f.write(line); f.flush()
            n += 1
            if n % 25 == 0:
                pct = (seg.end / info.duration * 100) if info.duration else 0
                print(f"[progress] {n} segments | {hms(seg.end)} / {hms(info.duration)} "
                      f"({pct:.0f}%) | elapsed {hms(time.time()-t0)}", flush=True)
        f.write(f"\n# END — {n} segments, elapsed {hms(time.time()-t0)}\n")
    print(f"[done] {n} segments written to {OUT} in {hms(time.time()-t0)}", flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
