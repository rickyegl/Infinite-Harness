# Status

> **packages/protocol changed (plan 02):** `src/manifest.ts` gained the types a module's `run.ts` receives:
> `ModuleContext`, `AgentOptions`, `AgentResult`, `ShResult`, `ModuleRun`. Additive only; no event type changed.
>
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
  The author looked at it and liked it (2026-11-12).
- **Done (plan 02):** the bridge (`apps/bridge`): runs a prompt through the router, modules and headless
  workers, stores and streams events; the site's live mode posts prompts and draws the run as it happens;
  `pnpm take` turns a run into a take that replays offline. Details under "The bridge" below.
- **Next:** the module plans (03-07), then plan 08 replaces fixtures with recorded takes and finalises the
  draft direction files (S37-S40, S42-S47).

## Waiting on the author

Agents write here what they stopped for (a program to open, a runtime to start, a sign-in, a question) and
remove the line when it is answered. See `AGENTS.md` rule 5.

- (plan 02) **Start the local model proxy** (port in `proxy.baseUrl`) and confirm `proxy.routerModel` in
  `harness.local.json` and the `HARNESS_PROXY_KEY` variable. Unblocks: the router's first-choice route (it falls
  back to a worker, about 5-6 s per prompt, until then), the "AI subscription: Connected" line in the settings
  sheet, and the live router test. Next: re-run `pnpm --filter bridge record:router` and record the proxy latency here.
- (plan 02) **Sign the `primary` worker CLI in again** (its session expired). Unblocks: an end-to-end run of
  the `stream-json` adapter and its no-network probe in `pnpm --filter bridge test`. Next: run both and fix
  whatever the adapter gets wrong.

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

- Plan 02 (2026-11-12), all on this machine:
  - `pnpm typecheck` clean; `pnpm test`: protocol 13, web 7, bridge 33 passed and 2 skipped (the live proxy
    router call: proxy down; the `primary` no-network probe: sign-in expired). Bridge tests: store (seq and t
    monotone, restart closes open cells, torn last line, reopen keeps seq), server (401 without the token,
    WebSocket events equal events.jsonl, replay from seq 0 and from seq 10, artifacts, dotfiles and traversal
    refused), router table (16 recorded plans), allow (vocabulary, grants, adapter arguments).
  - No-network probe, real `secondary` worker with no network grant asked to fetch a local URL: the local server
    got zero requests and the answer did not contain the secret word.
  - Real worker run (`pnpm smoke`, "say hello three ways", run 20261112-231406): the router (worker fallback)
    planned one agent cell; the worker called `report_step` and `spawn_task` three times through the harness MCP
    server; the three child cells appeared with their evidence. That run is take `smoke`.
  - `pnpm test:bridge`: the site paired to a bridge in mock mode; the typed prompt starts a run; a reload mid-run
    brings every cell back from seq 0; at the end the cells and states on screen equal `reduce(events.jsonl)`;
    clicking a child opens its focus view; with the bridge closed, `/?director=1&take=smoke` replays all cells
    with no request to the bridge and no page errors.
  - `pnpm test:live` and `pnpm test:determinism` (96/96) still pass; `pnpm lint:brand` clean (now scans
    `apps/bridge` too).

## The bridge (plan 02)

Run it: `pnpm dev` starts the bridge (`127.0.0.1:7411`) and the site (`127.0.0.1:5173`). Pair the browser once:
`pnpm pair` prints a link, or paste `runs/.bridge-token` into the settings sheet (gear on the prompt screen).
Endpoints, config keys and scripts: `apps/bridge/README.md`. The `allow` vocabulary, the fixture format and the
harness MCP launch are in `plan/00-contract.md`.

| URL | What |
|---|---|
| `/` | Prompt screen ("Ask for anything", mic, send). Sending starts a run and moves to `/?run=<id>`. |
| `/?run=<id>` | The run's graph, live from the WebSocket (from seq 0, so a reload rebuilds it). Click a cell for focus; the bar at the bottom sends a follow-up (`/say`) to the same graph. |
| `/?take=<take>` | A take on the wall clock, no bridge. |
| `/?director=1&take=<take>` | A whole take in director mode (seek only), no shot or timeline needed. |

Mock mode: `HARNESS_MOCK=1 pnpm dev` replays recorded router plans and module fixtures; nothing is called.
Modules so far: `mock.echo`, `mock.agent` (fixture `hello`, recorded from a real run), `mock.asset`.

**Hand-off.**

- Worker command lines, by config key (the real paths, versions and full flags are in `plan/LOCAL.md`):
  - `workers.secondary`, adapter `exec-jsonl`: `<cli> exec <config args> --json --skip-git-repo-check
    --ephemeral --ignore-user-config -s workspace-write -C <cell folder> --add-dir <write grants>
    [--output-schema <file>] <tool and network switches from allow> <harness MCP server as -c overrides> -`
    (prompt on stdin). This machine needs one config arg for its sandbox mode (in LOCAL.md), or every write fails.
  - `workers.primary`, adapter `stream-json`: `<cli> -p --output-format stream-json --verbose
    --no-session-persistence --strict-mcp-config --mcp-config <cell>/.mcp-servers.json --restricted --tools
    <granted built-ins> --allowedTools <granted tools> --permission-mode acceptEdits --add-dir <write grants>
    [--model <id>] [--json-schema <schema>]` (prompt on stdin). Built and unit-tested; not yet run end to end.
- Router model id key: `proxy.routerModel` (proxy route, first choice). Fallback worker: `router.worker`
  (currently `secondary`). Recorded plans say which backend and key produced them.
- Router latency (worker fallback; the proxy was down): 4.8-8.3 s per prompt, median about 5.8 s; the Act 1
  prompt 15.8 s. The proxy route is not measured yet.
- What the adapters cannot observe or enforce:
  - Reads. `allow` has no read list; a worker can read any file the user can.
  - Hosts. `network` names other than `*` are not enforced per host; only "no shell and no web" (no way to reach
    a host) or `*`. On this machine the sandbox does not cut the network for shell commands, which is why
    `shell` requires `network: ["*"]`.
  - What an MCP server from the CLI's own config does on its side (only the call and its result are seen).
  - Built-in tool calls appear as steps only as far as each CLI's event stream reports them; the `stream-json`
    adapter's mapping is unverified until the primary worker is signed in again.

## The stage (plan 01)

Run it: `pnpm install`, then `pnpm dev` and open `http://127.0.0.1:5173/?fixture=main&start=40000` (`/` is now
the bridge's prompt screen, see above).

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
| `title` | `fake` (small wordmark, dims), `implode` (cells converge on the wordmark in the first half beat), `end` (wordmark, `sub` line, fade to black). | `implode` draws 64 abstract dots, not the film's real cells, so S46 does not yet show "every cell implodes". |

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
Sheet note: the 50% and 75% samples of S35 land exactly on the guide events (beats 8 and 12), so the sheet
shows the first tile of a wall that fills in over the next 200 ms. That is expected, not a bug.

### Fixtures

`apps/web/fixtures/main.jsonl` (190 events, the Act 2 tree) and one small file per Act 3 and Act 5 take (night,
crossplay, realistic, music, house.*, study, cad, cad.sim, pcb, forecast, anomaly, car.house, house.game).
Placeholder art is SVG in `apps/web/fixtures/art/`. Maker ids appear only as `maker` values on `node.spawn`
lines. Icons belong in `apps/web/public/makers/<id>.svg`. None are there yet, so the neutral glyph is drawn.
The tools report "page errors": all of them are 404s for `video/takes/<take>/events.jsonl`, which the stage tries
before falling back to the fixture (checked: the full film has 20, one per take, and nothing else fails; all 48
`?director=1&shot=<id>` URLs reach ready with no script errors). They disappear once plan 08 records the takes.

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
- ASSUMED (plan 02): in Act 1, "Game (Unity+Roblox)" is one game cell whose prompt names both engines (the game
  module runs both); Voice is the narration of the trailer and the campaign (`router.md` rule 7).
- ASSUMED (plan 02): the PCB board is not decided yet (S38); the router table uses "a motor driver PCB".
- ASSUMED (plan 02): the pairing token lives in `runs/.bridge-token` (gitignored, never printed by the bridge);
  the site keeps it in localStorage. `pnpm pair` prints a pairing link only when run in a terminal.
- ASSUMED (plan 02): the router's worker fallback stays on `secondary` (the only signed-in worker today).

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
| 02 | done | typecheck, unit tests, real worker smoke run, no-network probe, test:bridge, test:live, determinism, lint:brand | See "The bridge". Waiting: proxy start, primary worker sign-in. |
| 03 | not started | | |
| 04 | not started | | |
| 05 | not started | | |
| 06 | not started | | |
| 07 | not started | | |
| 08 | not started | | |
| 09 | not started | | |
| 10 | not started | | |
