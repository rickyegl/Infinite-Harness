"""Dry-run publishing plan for the harness's reels, using the studio's own schedulers without letting them act.

Run with the studio's shared/tools folder as the working directory:  python plan.py <reels.json>
reels.json: [{"generator", "project", "file" (full path of the mp4), "title"}]

Nothing is written and nothing goes over the network:
- every socket connect and name lookup raises, so a scheduler that tried to reach a platform would fail loudly;
- the schedulers' writers (posts csv, catalog) are replaced by functions that raise;
- the reels are added to the catalog in memory only, as unpublished rows, so the planners give them slots.
TikTok and Instagram use the planners' own `plan()` (their "no browser" command). YouTube's planner needs its API,
so its slot comes from the channel's daily time and the catalog's scheduled rows instead.
Prints one JSON object whose "mode" is "DRY RUN".
"""
import json
import socket
import sys
from datetime import timedelta
from pathlib import Path

sys.dont_write_bytecode = True


def _blocked(*_a, **_k):
    raise OSError("network blocked: publish runs as a dry run")


socket.socket.connect = _blocked
socket.socket.connect_ex = _blocked
socket.create_connection = _blocked
socket.getaddrinfo = _blocked

TOOLS = Path.cwd()
sys.path.insert(0, str(TOOLS))

import studio  # noqa: E402
import tt_schedule as tts  # noqa: E402
import ig_schedule as igs  # noqa: E402
from publish_common import iso_local, now, parse_dt, slot_on  # noqa: E402


def _no_write(*_a, **_k):
    raise RuntimeError("write blocked: publish runs as a dry run")


studio.write = _no_write
tts.write_posts = _no_write
tts.upsert = _no_write
for name in ("write_posts", "upsert", "save"):
    if hasattr(igs, name):
        setattr(igs, name, _no_write)

reels = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
mine = {Path(r["file"]).name: r for r in reels}
stems = [Path(r["file"]).stem for r in reels]
today = now().date().isoformat()
extra = [{"generator": r["generator"], "project": r["project"], "file": Path(r["file"]).name, "status": "unpublished",
          "shipped": today, "published": "", "url": "", "video_id": "", "scheduled_at": "", "published_at": "",
          "yt_status": "", "lang": "en", "notes": "harness dry run"} for r in reels]

_read = studio.read
catalog = _read()
studio.read = lambda: catalog + extra
tts.studio.read = studio.read

_find, _meta, _es = tts.find_file, tts.upload_meta, tts.es_title
tts.find_file = lambda g, name: Path(mine[name]["file"]) if name in mine else (None if Path(name).stem.removesuffix("_es") in stems else _find(g, name))
tts.upload_meta = lambda row, c: {"title": mine[row["file"]]["title"], "description": ""} if row["file"] in mine else _meta(row, c)
tts.es_title = lambda row: "" if row["file"] in mine else _es(row)

out = []
cfg = tts.load()
for e in tts.plan(cfg, stems=stems):
    out.append({"platform": "TikTok", **e})
for e in igs.plan(cfg, None, stems):
    out.append({"platform": "Instagram", **e})

# YouTube: each channel that takes the generator, on its next free day by the catalog
channels = json.loads((TOOLS / "yt_channels.json").read_text(encoding="utf-8"))
lead = now() + timedelta(minutes=20)
for r in reels:
    for ch, c in channels.items():
        if r["generator"] not in c.get("generators", []) or c.get("lang", "en") != "en":
            continue
        taken = {parse_dt(x["scheduled_at"]).date() for x in catalog
                 if x["generator"] == r["generator"] and (x.get("lang") or "en") == "en" and x.get("scheduled_at")}
        d = lead.date()
        while slot_on(d, c) < lead or d in taken:
            d += timedelta(days=1)
        out.append({"platform": "YouTube", "generator": r["generator"], "stem": Path(r["file"]).stem, "account": ch,
                    "lang": "en", "file": r["file"], "caption": r["title"], "post_at": iso_local(slot_on(d, c)),
                    "status": "ready", "note": "next free day by the catalog (YouTube itself not read)"})

for r in reels:
    if not any(e["stem"] == Path(r["file"]).stem for e in out):
        out.append({"platform": "-", "generator": r["generator"], "stem": Path(r["file"]).stem, "account": "-",
                    "lang": "en", "file": r["file"], "caption": r["title"], "post_at": "", "status": "no account",
                    "note": f"no channel or account posts {r['generator']}"})

print(json.dumps({"mode": "DRY RUN", "entries": out}, ensure_ascii=False))
