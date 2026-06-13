# Extract one frame every INTERVAL seconds from the meeting video using PyAV.
# Frames are named frame-HHMMSS.jpg so each can be matched to the transcript
# segment at the same timestamp. Read-only on the video (safe to run alongside
# the transcription, which opens its own handle).
import av, os, sys, traceback

VIDEO = r"E:\Sigma PMO\eiw-ibfq-pgz (2026-06-12 18_49 GMT+3).mp4"
OUTDIR = r"E:\Sigma PMO\docs\meetings\frames"
INTERVAL = 60  # seconds between frames

def tag(s):
    s = int(s); return f"{s//3600:02d}{(s%3600)//60:02d}{s%60:02d}"

def main():
    os.makedirs(OUTDIR, exist_ok=True)
    container = av.open(VIDEO)
    vs = container.streams.video[0]
    dur = float(container.duration) / 1_000_000  # AV_TIME_BASE microseconds
    tb = vs.time_base
    total = int(dur // INTERVAL) + 1
    print(f"[frames] duration={dur:.0f}s interval={INTERVAL}s -> ~{total} frames", flush=True)
    saved = 0
    for t in range(0, int(dur) + 1, INTERVAL):
        target_pts = int(t / tb)
        container.seek(target_pts, stream=vs, backward=True, any_frame=False)
        got = None
        for frame in container.decode(vs):
            if frame.time is None:
                continue
            if frame.time >= t - 0.5:
                got = frame
                break
        if got is None:
            print(f"[frames] no frame at {t}s", flush=True)
            continue
        img = got.to_image()
        img.save(os.path.join(OUTDIR, f"frame-{tag(t)}.jpg"), quality=85)
        saved += 1
        if saved % 10 == 0:
            print(f"[frames] saved {saved}/{total} (at {tag(t)})", flush=True)
    container.close()
    print(f"[frames] DONE saved={saved} to {OUTDIR}", flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
