# Status

> **packages/protocol changed (plan 01, commit 19ca915):** the package was created: event and manifest types
> from the contract and `reduce(events, t)`. Modules import their types from `@harness/protocol`.

Every agent updates this file at the end of its plan: what is done, how it was verified, open problems, and
what the next agent should know. Keep it short; replace stale lines instead of appending forever.

## Now

- **Done:** repository created; film shot layout (`video/SHOTS.md`, `video/shots.json`, resolver script);
  plan files 00-10; text-card preview render; **film re-cut faster on one steady tempo**
  (128 BPM, 75 bars, 2:21). 3:00 is a limit, not a target. **Score approved** by the author (2026-11-12):
  built from generated takes plus the chosen song (`video/tools/score.py`, `video/score/cues.json`).
- **Done (plan 01):** the stage. `apps/web` renders all 48 shots from fixture events and a clock, with no
  backend: eight views, camera, director and live modes, fixtures for every take, draft and hand-tuned direction
  files, contact sheets, the rough cut, determinism and live tests. Details under "The stage" below.
- **Next:** the plans that make takes real (02-07), then plan 08 replaces fixtures with recorded takes and
  finalises the draft direction files (S37-S40, S42-S47).

## Verified

- `node video/tools/resolve.mjs`: 48 shots, 75 bars, 140.6 s; fastest voice line 2.9 words per second.
- `node video/tools/preview.mjs` renders `video/renders/shots-preview.mp4` with `score.wav` (duration checked
  with ffprobe against `timeline.json`).
- `python video/tools/score.py`: every take measured at 128.0 BPM; each cue's span within 8 ms of the grid.
  The author listened to the preview and approved it. Since then S24b (the three reels side by side, bars
  38-40) was added and everything after it moved 3 bars; its reel sound waits for plan 05.

- Plan 01 (2026-11-12), all on this machine:
  - `pnpm typecheck` clean; `pnpm test`: protocol 13 tests, web 7 tests (time map, timebase, effects).
  - `pnpm test:determinism`: 96/96 seeks byte-identical (every shot at 37% and 81% of its length, each reached
    once in order and once after jumping elsewhere; three.js shots included).
  - `pnpm test:live`: 22 checks pass (click a cell opens focus; Escape and a click outside return; maker badges
    on Image, Voice, 3D Model and Video cells, none on agents and orchestrators; MADE WITH in the focus view).
  - `pnpm shots:sheet`: `video/renders/sheet_01.png` ... `sheet_06.png`; all 48 shots looked at and recognisable.
  - `pnpm film:rough`: `video/renders/rough.mp4`. ffprobe gives 140.625 s for the video, the audio and the
    file, equal to `total`; 4500 frames at 32 fps (15 frames per beat), so every cut is on a click; click track
    plus `score.wav`.
  - `pnpm lint:brand` clean.
  - Verify first: GSAP 3.15 is free to use (no paid licence needed), and a `gsap.timeline({ paused: true })`
    driven only by `.seek()` is deterministic. three.js is driven by explicit time: each scene renders once per
    React commit with its orbit angle computed from the evidence's age, never in its own animation loop.

## The stage (plan 01)

Run it: `pnpm install`, then `pnpm dev` and open `http://127.0.0.1:5173/`.

| URL | What |
|---|---|
| `/?fixture=main&start=40000` | Live mode: the fixture plays on the wall clock from `start` ms. Click a cell for its focus view; Escape or a click outside the panel returns. |
| `/?director=1&shot=S11` | One shot. Time moves only through `window.__harness.seek(ms)`. |
| `/?director=1&from=S09&to=S20` | A range, on the film's timeline. Add `&t=<ms>` to open at a time, `&play=1` to play it on the wall clock. |

`window.__harness = { mode, ready, duration, shots: [{ id, at, durMs, view }], seek(ms): Promise, view?() }`.
`seek` resolves after React has committed, fonts are loaded, every image on the stage is decoded and two
frames have been drawn. `view()` (live only) returns `{ view, focus }`.

Tools. Each starts the dev server itself on port 5199 (or uses `HARNESS_WEB_URL`); the tests use 5198.

| Command | Writes |
|---|---|
| `pnpm shots:direct [S28 S29] [--force]` | Draft `video/direction/<shot>.json`; keeps files with `"draft": false` unless `--force`. |
| `pnpm shots:sheet [--from S09 --to S20]` | `video/renders/sheet_01.png` ... (8 shots each, at 25/50/75%); a partial range writes `sheet_S09-S20_01.png`. |
| `node video/tools/capture.mjs --shot S11 [--fps 60] [--scale 1]` | `video/renders/S11.mp4` (or `--from`/`--to`, `--out`). |
| `pnpm film:rough [--fps 32] [--scale 0.5]` | `video/renders/rough.mp4`, `total` long, click track plus the music in `timeline.grid.music`. 32 fps puts 15 frames on a beat. |
| `pnpm test:determinism`, `pnpm test:live` | Checks only. |

The browser flags in `video/tools/stage.mjs` (`CHROMIUM_ARGS`) are part of determinism: GPU raster and partial
tile re-raster each left 1-level differences on text that depended on the previous frame. Any new capture tool
should use `launch()` from there.

**Rendering rule as built.** UI = f(events, t, view). `global.css` turns CSS transitions and animations off.
Every motion is a function of shot-local time or of an event's age; the camera is a paused GSAP timeline that is
only seeked.

### What each view can and cannot do

| View | Can | Cannot yet |
|---|---|---|
| `prompt` | Text box with word-by-word typing over `typeBeats` (words spread evenly), `prior` text, caret on 8th notes; chips that appear on beats, replace each other, blink a dot or show a globe; `ring` (chips form the ring), `glitch`, `slam`, `push`, `appear`, `enter` (punch). | Typing is not driven by voice word timings; plan 05/08 can set `typeBeats` per line or add a `words` param. |
| `graph` | Polar tidy tree around the root with a seeded offset; sub-orchestrators laid out the same way; cells with icon, label, state ring, maker badge, live evidence thumbnail, child count; new cells ease out of their parent; curved edges; request/deliver lights travel along a bright edge; `intro: "collapse"`, `verify` (check marks cascade), REC dot in director mode. | In director mode the camera fits the take's final graph, so the first cells look small (S09, S10). Long request edges can leave the frame (S13). |
| `focus` | Camera tween into a cell, breadcrumb header, step ticker, evidence stage (`revealMs`; `kind` picks one evidence kind), facts column (elapsed, files, tools as icons, MADE WITH maker icon). | No scrolling for long tickers; facts are only what the events carry. |
| `split` | One or two windows (`left`/`right`: node, kind, label, evidence index), `lit` cells in a mini-graph, `cuts`, a `link` line between windows, `rise`, `full` (full bleed), `mini`. | Vertical sources are cropped to the window (S16 reels). |
| `wall` | `grid` or `reels` layout of evidence, `stagger` in beats, `fadeBeats`, `push`, `drift`. | The first tile in S25 (the link) shows a dark page until its URL has typed in. |
| `banner` | Module title with icon and maker mark, the prompt typing under it, breadcrumbs, the cell's evidence full width, `graphBehind` (dimmed graph through a cutout). | One cell per banner. |
| `rain` | Every take merged into one graph, prompts swiping through the box at `rate` per beat (`offset` into the list), a title line, zoom out. | Prompts come from `rain` in `video/timeline.json` (the resolver's list); there is no per-shot list. |
| `title` | `fake` (small wordmark, dims), `implode` (cells converge on the wordmark in the first half beat), `end` (wordmark, `sub` line, fade to black). | |

Evidence kinds: image (resolves from blur, cross-fade from `prev`, noise), frames and video (`FrameClip`, frame
index from age), model3d (procedural kart, house, robot, board; parts arrive per `partBeats`; orbit from age),
audio (waveform with playhead), chart (history, forecast band, anomaly markers), doc (page fan, line drawing, grid
of guides), code (diff with glint), link (browser frame with typed URL). Real glTF files are not loaded yet; the
loader that plan 04/08 adds must keep the "render per commit" rule.

### Direction files

`video/direction/<shot>.json`, typed in `apps/web/src/direction.ts`. Positions are beats from the shot's first
beat; the take is addressed in its own ms.

| Field | Meaning |
|---|---|
| `shot`, `view` | Shot id and one of the eight views. |
| `draft` | `true` if written by `direct.mjs`; set `false` once hand-tuned. |
| `take`, `mergeTakes` | `video/takes/<take>/events.jsonl`, falling back to `apps/web/fixtures/<take>.jsonl`. |
| `events.at` | Piecewise-linear map `[[beat, takeMs], ...]`. Past either end it extends the end segment's slope; a flat map (`[[0, 40000], [1, 40000]]`) holds the take still. |
| `camera` | Keys `{ beat, target: "all" or a node id or a list of ids, zoom?, dur? (beats, 0 = cut), ease?, dx?, dy? }`. |
| `focus` | The node the view centres on. |
| `fx` | `{ type: "flash" / "shake" / "punch" / "fade" / "blur", beat, dur?, ... }`. |
| `params` | View settings (see the table above). |
| `note` | Free text. |

Example, `video/direction/S11.json` (Unity > Karts: the take runs at twice speed while the camera dives in):

```json
{
  "draft": false, "shot": "S11", "view": "focus", "take": "main", "focus": "u.karts",
  "events": { "at": [[0, 8000], [4, 11750]] },
  "camera": [
    { "beat": 0, "target": ["unity", "u.karts"], "zoom": 1, "dur": 0 },
    { "beat": 0, "target": "u.karts", "zoom": 2.4, "dur": 1, "ease": "power3.in" }
  ],
  "params": { "revealMs": 300 }
}
```

Hand-tuned: S01-S36 and S41. Drafts: S37-S40 and S42-S47. They render and read correctly; plan 08 tunes them.

### Fixtures

`apps/web/fixtures/main.jsonl` (190 events, the Act 2 tree) and one small file per Act 3 and Act 5 take (night,
crossplay, realistic, music, house.*, study, cad, cad.sim, pcb, forecast, anomaly, car.house, house.game).
Placeholder art is SVG in `apps/web/fixtures/art/`. Maker ids appear only as `maker` values on `node.spawn`
lines. Icons belong in `apps/web/public/makers/<id>.svg`. None are there yet, so the neutral glyph is drawn and
the browser logs one expected 404 per missing icon.

## Decisions by the author (2026-11-11)

- Deadline: 3 days. Most module internals already exist in other projects; expect wrap-and-wire work.
- Film: record real runs, replay on the beat clock; edit with HyperFrames.
- Agents: headless CLI workers.
- Unity: Unity 6 + WebGL module.
- (2026-11-12) The two generated full-length tracks are dropped: their arc did not match the shots. The music
  is now scored to the film in short cues (see "Music cues" in `video/SHOTS.md`). The opening prompt is read in
  18-20 s. The film has no minimum length.
- (2026-11-12) Every commit ends with the co-author trailer in `plan/LOCAL.md` ("Commit trailer"), whichever
  tool or model made it. `AGENTS.md` at the repo root says so to every agent.
- (2026-11-12) Cells of non-LLM generators show their maker's icon in the graph (contract, "Maker icons").
  LLM vendors stay unnamed and unshown.

## ASSUMED (see the list at the end of 00-contract.md)

- ASSUMED: the maker mark is an icon only (no name in text), on every non-LLM generator cell including Image
  and Forecast, whose makers also make LLMs. Non-AI tools (render, host, recorder) get none.
- ASSUMED: icon files are not fetched by agents; the author supplies or approves them (USER-TODO 19).
- ASSUMED (plan 01): the prompt said "plan/0N-<name>.md" with N unfilled; plan 01 was taken as the next plan.
- ASSUMED (plan 01): fixtures were produced by a one-off generator script; only its output (`apps/web/fixtures/`)
  is committed. They stand in for the hand-written fixtures the plan allows; plan 08 replaces them.
- ASSUMED (plan 01): `video/tools/score.py` used a word on the brand deny-list as a variable name; it was
  renamed (`strength`) so `pnpm lint:brand` is clean. Behaviour is unchanged.

## Open problems

- The opening line no longer asks for a cloned voice, but the Voice cell still appears in S09 and S16.
- Audio files are not in git (`video/audio/` is ignored), except `video/makeasong.mp3`. `score.wav` and its
  takes live only on this machine; keep them. Regenerating from the seeds in `cues.json` may not give
  identical takes.
- `video/tools/marker.html` (the old two-track marker) is no longer used.
- Unity automation path on this machine is unconfirmed (USER-TODO 6).
- `cloudflared` is not installed (USER-TODO 2). Unity 6 has no WebGL module yet (USER-TODO 1).

## Per-plan log

| Plan | State | Verified by | Notes |
|---|---|---|---|
| 01 | done | typecheck, unit tests, determinism 96/96, live test, sheets, rough cut duration, lint:brand | See "The stage". Drafts S37-S40, S42-S47 left for plan 08. |
| 02 | not started | | |
| 03 | not started | | |
| 04 | not started | | |
| 05 | not started | | |
| 06 | not started | | |
| 07 | not started | | |
| 08 | not started | | |
| 09 | not started | | |
| 10 | not started | | |
