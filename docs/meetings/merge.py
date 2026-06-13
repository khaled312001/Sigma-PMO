# Merge the timestamped transcript with the per-minute on-screen catalog into one
# aligned document: at each minute boundary, show what was on screen, then the
# spoken lines in that minute. Re-run after the transcript finishes.
import re, os

BASE = r"E:\Sigma PMO\docs\meetings"
TRANSCRIPT = os.path.join(BASE, "transcript-2026-06-12.txt")
CATALOG = os.path.join(BASE, "frames-catalog.md")
OUT = os.path.join(BASE, "transcript-aligned-2026-06-12.md")

def parse_catalog():
    """minute(int) -> on-screen description, expanding ranges like 50:00-59:00."""
    screen = {}
    row = re.compile(r"^\|\s*(\d+):00(?:\s*[–-]\s*(\d+):00)?\s*\|\s*(.*?)\s*\|\s*$")
    with open(CATALOG, encoding="utf-8") as f:
        for line in f:
            m = row.match(line.strip())
            if not m:
                continue
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else start
            desc = m.group(3)
            for mn in range(start, end + 1):
                screen[mn] = desc
    return screen

def parse_segments():
    """list of (start_sec, end_sec, text)."""
    segs = []
    pat = re.compile(r"^\[(\d{2}):(\d{2}):(\d{2})\s*->\s*(\d{2}):(\d{2}):(\d{2})\]\s*(.*)$")
    with open(TRANSCRIPT, encoding="utf-8") as f:
        for line in f:
            m = pat.match(line.strip())
            if not m:
                continue
            sh, sm, ss, eh, em, es, text = m.groups()
            start = int(sh) * 3600 + int(sm) * 60 + int(ss)
            end = int(eh) * 3600 + int(em) * 60 + int(es)
            segs.append((start, end, text))
    return segs

def hms(sec):
    return f"{sec//3600:02d}:{(sec%3600)//60:02d}:{sec%60:02d}"

def main():
    screen = parse_catalog()
    segs = parse_segments()
    lines = []
    lines.append("# Sigma meeting — aligned transcript + on-screen (2026-06-12 18:49 GMT+3)\n")
    lines.append("Khaled (presenter) demoing the Sigma PMO platform to Dr. Ayham over Google Meet.\n")
    lines.append("Each minute block shows **what was on screen** (frame) then the **spoken lines** in that minute.\n")
    lines.append(f"Source: faster-whisper medium · {len(segs)} segments · frames every 60s.\n")
    lines.append("\n---\n")
    last_minute = -1
    for start, end, text in segs:
        minute = start // 60
        if minute != last_minute:
            # emit on-screen markers for every minute from last_minute+1..minute
            for mn in range(last_minute + 1, minute + 1):
                if mn in screen:
                    lines.append(f"\n### ⏱ {mn:02d}:00 — 🖥 {screen[mn]}\n")
            last_minute = minute
        lines.append(f"`[{hms(start)}]` {text}")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"[merge] {len(segs)} segments x {len(screen)} catalog minutes -> {OUT}")

if __name__ == "__main__":
    main()
