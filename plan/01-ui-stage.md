# 01. The stage: all eight views, driven by fixture events

**Goal:** `apps/web` renders every view in [video/SHOTS.md](../video/SHOTS.md) from an event file and a clock,
with no backend. When this is done, any shot in the film can be previewed by URL.

**Read first:** [00-contract.md](00-contract.md) (the rendering rule and event protocol), `video/SHOTS.md`,
`video/shots.json`.

## Build

1. **Workspace.** `pnpm` workspace with `apps/web` (Vite + React + TypeScript), `packages/protocol` (event and
   manifest types from the contract, plus a `reduce(events, t) -> GraphState` function with unit tests).
2. **Clock.** `Clock` with two drivers: `live` (performance.now) and `director` (`window.__harness.seek(ms)`).
   Everything visual reads `clock.t`. Expose `window.__harness = { seek, duration, ready }`.
3. **Design tokens** (`apps/web/src/theme.ts`, used everywhere, no literals in components):
   background `#05060A`, panel `#0B0D14`, line `rgba(255,255,255,0.08)`, text `#E8ECF4`, dim `#7A8499`,
   accent `#3DF2FF`, hit `#FF2E63`, ok `#4CFFA6`. Type: one grotesk for UI, one mono for labels and the ticker,
   both bundled in `apps/web/public/fonts` (open licence). Radius 14, hairlines 1 px, glow = accent at 35% blur 24.
4. **Views** (one component each, switchable by state or by URL):
   - `prompt`: the text box, word-by-word typing from word timings, chips that leave the box.
   - `graph`: cells and edges. Layout is deterministic: tidy tree (d3-hierarchy) in polar form around the root,
     plus a small offset seeded by node id so it reads as organic, not gridded. Sub-orchestrators lay out their
     children the same way inside their own region. New cells ease from their parent's position. Edges are
     curves with a travelling light for `node.request` / `node.deliver`.
   - Cell: icon, label, state ring (queued, running, waiting, done, failed), live thumbnail from the latest
     evidence, child count.
   - `focus`: camera tween into a cell; step ticker, evidence stage, facts column (elapsed, files, tools used
     as icons).
   - Evidence stage renderers by `kind`: image, frames (screenshot stream), video (`FrameClip`), model3d
     (`<model-viewer>` or three.js, orbit is a function of `t`), audio (waveform), chart (history + forecast band
     + anomaly markers), doc (page stack), code (diff glint), link (browser frame with URL).
   - `split`, `wall`, `banner` (module name on top, breadcrumb strip), `rain` (prompt list from `shots.json`),
     `title`.
5. **Camera.** One world transform (x, y, zoom) tweened on the master timeline. Camera targets: a node id, a
   bounding box of nodes, or "all".
6. **Director.** `?director=1&shot=S11` loads `video/timeline.json`, the shot's take
   (`video/takes/<take>/events.jsonl`, falling back to `apps/web/fixtures/<take>.jsonl`) and a per-shot
   direction file `video/direction/<shot>.json` (view, camera targets by beat, which events to show and how fast).
   `?director=1&from=S09&to=S20` plays a range.
7. **Fixtures.** Hand-write `apps/web/fixtures/main.jsonl` (about 150 events covering the Act 2 tree: game
   orchestrator, two engine sub-orchestrators with subtrees, an asset request and delivery, trailer, campaign,
   voice, host, recorder, verifier) and one small fixture per Act 5 take, with placeholder images. Fixtures are
   the only hand-written event files allowed; real takes replace them in plan 08.
8. **Contact sheet.** `pnpm shots:sheet` uses Playwright to open every shot at 25%, 50% and 75% of its duration
   and tiles the screenshots into `video/renders/sheet_*.png`.

## Verify first

- GSAP licence and current API for seekable timelines (`timeline.seek`, `paused: true`).
- That the chosen 3D viewer can be driven by an explicit time rather than its own animation loop.

## Done when

- `pnpm --filter web dev` then `/?director=1&shot=S10` (and every other shot id) renders without a backend.
- Seeking to the same `t` twice gives pixel-identical screenshots (test: two captures, byte compare).
- `pnpm shots:sheet` produces sheets where all 47 shots are recognisable against the table in `SHOTS.md`.
- No vendor or model name appears anywhere in `apps/web` (`pnpm lint:brand` greps a deny-list read from
  `harness.local.json`, so the list itself is not in the repo).

## Hand off

`plan/STATUS.md`: what each view can and cannot do yet, the direction-file format with one example, and the
contact sheet path.
