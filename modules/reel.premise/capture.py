"""Record one premise take in Roblox Studio, the studio's way (premise/howto/capture.md), hands-free.

    python capture.py <studio root> <project dir> <day|night> [--place "Global Set"] [--seconds 62]
                      [--box 28,218,1024,1606]

The project's Shots.lua must already be generated. This pushes it into the recording place, resets the preview,
starts the studio recorder on the portrait monitor, presses Play, waits for the cutscene runner to finish, stops
Play, cuts the set-change holds (strip_holds.py) and measures where the picture starts (the end of the white slate,
measured here because find_slate misreads a light sky). Writes capture/capture_<lighting>.mkv and
capture/capture_clean_<lighting>.mkv and prints one JSON line: {"clean", "start", "end", "frames", "shots"}.

Needs: the recording place open in Studio (its name contains --place), Studio in its full-screen layout on the
portrait monitor, not in Play. Fails loudly on a bad take; never returns a partial one.
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np


def opt(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def white_runs(video, box, fps=30):
    """[(t0, t1)] where the slate box is near-white (the runner's slates before t=0 and after the last shot)"""
    x, y, w, h = box
    W, H = 64, 100
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={fps},crop={w}:{h}:{x}:{y},scale={W}:{H}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
    white = (a.min(axis=3) > 235).mean(axis=(1, 2)) > 0.95
    runs, i = [], 0
    while i < len(white):
        if white[i]:
            j = i
            while j < len(white) and white[j]:
                j += 1
            runs.append((i / fps, j / fps))
            i = j
        else:
            i += 1
    return runs, len(white) / fps


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    root, proj, lighting = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    place, seconds = opt("--place", "Global Set"), float(opt("--seconds", 62))
    box = [int(v) for v in opt("--box", "28,218,1024,1606").split(",")]
    for d in ("shared/tools", "premise/tools"):
        sys.path.insert(0, str(root / d))
    import preview  # noqa: E402  (the studio's own sync)
    from studio_mcp import Studio  # noqa: E402

    raw, clean = proj / "capture" / f"capture_{lighting}.mkv", proj / "capture" / f"capture_clean_{lighting}.mkv"
    raw.parent.mkdir(exist_ok=True)
    with Studio(name_contains=place) as s:
        sid = s.studio_id
        mode = re.search(r"Current Studio Mode:\s*(\w+)", s.tool("get_studio_state", {"studio_id": sid}))
        if not mode or mode.group(1) != "Edit":
            raise SystemExit(f"Studio is not in Edit mode ({mode.group(1) if mode else 'unknown'}): stop Play first")
        preview.sync(s, proj.name)
        s.luau('local SP = require(game.ServerStorage:FindFirstChild("ShotPreview", true)); SP.reset()\n'
               'workspace.CurrentCamera.FieldOfView = 70\ngame:GetService("Selection"):Set({})\nreturn "ok"')
        rec = subprocess.Popen([sys.executable, str(root / "premise" / "tools" / "record.py"), str(raw), "--seconds", str(int(seconds))],
                               cwd=str(proj), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        time.sleep(2)
        s.tool("start_stop_play", {"is_start": True, "studio_id": sid})
        try:
            out, _ = rec.communicate(timeout=seconds + 120)
        finally:
            console = s.tool("get_console_output", {"studio_id": sid})
            s.tool("start_stop_play", {"is_start": False, "studio_id": sid})
    if rec.returncode != 0 or not raw.exists():
        raise SystemExit(f"the recorder failed: {(out or '').strip().splitlines()[-1:]}")
    done = [m for m in re.finditer(r"\[cutscene\] done (\d+) frames, (\d+) set holds\s+(\S+)", console)]
    if not done:
        raise SystemExit("the cutscene runner never finished (no 'done' line in Studio's output)")
    frames = int(done[-1].group(1))
    shots = {int(k): float(v) for k, v in (x.split("@") for x in done[-1].group(3).split(","))}

    r = subprocess.run([sys.executable, str(root / "premise" / "tools" / "strip_holds.py"), str(raw), str(clean), "--box",
                        ",".join(map(str, box))], capture_output=True, text=True)
    if r.returncode != 0 or not clean.exists():
        raise SystemExit(f"strip_holds failed: {(r.stderr or r.stdout).strip()[-200:]}")
    runs, total = white_runs(str(clean), box)
    runs = [x for x in runs if x[1] - x[0] >= 0.3]
    if len(runs) < 2:
        raise SystemExit(f"no white slates in the take (found {runs})")
    start, end = runs[0][1], runs[1][0]
    print(json.dumps({"clean": str(clean), "start": round(start, 3), "end": round(end, 3), "frames": frames, "shots": len(shots)}))


if __name__ == "__main__":
    main()
