# 08. Capture the takes

**Goal:** every shot in [video/SHOTS.md](../video/SHOTS.md) with source `replay` or `clip` has a real take in
`video/takes/<take>/`, and every shot has a direction file. After this plan the film can be rendered without
running any module again.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `video/SHOTS.md`, `video/shots.json`.
Needs the author present (approvals, the voice, and looking at results).

## Takes to capture

| Take | Prompt(s) | Shots |
|---|---|---|
| `main` | The Act 1 prompt, exactly as spoken | S02-S20, S25 |
| `night` | "make it night" on `main` | S21 |
| `crossplay` | "add crossplay" on `main` | S22 |
| `realistic` | "make it realistic" on `main` | S23 |
| `music` | "add music" on `main` | S24 |
| `house.image`, `house.red`, `house.cutout`, `house.plan`, `house.blender`, `house.render`, `house.video` | the house chain, one run | S28-S34 |
| `study` | the Canvas line | S35 |
| `cad`, `cad.sim` | the CAD line; supplied simulator clip | S36, S37 |
| `pcb`, `forecast`, `anomaly` | their lines | S38-S40 |
| `car.house`, `house.game` | the last two lines | S41, S42 |

## Build

1. **Run for real.** Fresh bridge, real modules (`HARNESS_MOCK` unset), `HARNESS_AUTO_APPROVE=1` only while the
   author watches. Run `main` end to end; redo until it is clean. Then the four follow-ups on that same run.
   Then one run for the whole Act 5 chain.
2. **`pnpm take <runId> <take> [--from <seq> --to <seq>]`** (extend plan 02's command): copies the event range
   and only the artifacts those events reference; rewrites `t` to start at 0; writes `take.json` (source run
   id, date, modules, real or mock per node).
3. **Trim, never invent.** `video/tools/retime.mjs <take> --direction <file>`: maps real event times onto beat
   times (for example "all `node.spawn` of the first ring: one per beat starting bar 13"). It may drop events,
   reorder nothing within a node, and compress time. It must refuse to add events that are not in the source
   run. Output: `video/takes/<take>/events.film.jsonl`.
4. **Direction files** `video/direction/<shot>.json` for all 47 shots: view, camera keyframes in beats, which
   node is in focus, which evidence items appear on which beat, typed text and its word timings (from the
   voice recordings, see below), flashes and shakes in beats.
5. **Clips to frames.** `video/tools/frames.mjs`: every video the film shows becomes numbered JPEG frames at
   60 fps for `FrameClip` (director mode never plays a `<video>`).
6. **Voice timings.** When the author's recordings are in `video/audio/voice/`, get word timestamps (the
   studio's caption tool or a local speech model) into `video/audio/voice/words.json`; S02-S08, S21-S24, S27
   and S28-S42 type from it. Until then generate provisional timings from the text at the shot's length.
7. **Gameplay clips** for S19, S20, S42: record both games at 60 fps, 10-15 s each, with the cuts chosen to
   show fighting while racing.
8. **Honesty sheet.** `video/takes/README.md` (generated): for every shot, the take, the source run id, and
   whether each visible cell was real or mock. This goes in the submission.

## Verify first

- All `USER-TODO` items marked needed-for-capture are done; list any that are not and capture around them.
- Disk space for frames (a 10 s 1080p60 clip is about 600 JPEGs).
- Credits and quotas before the long runs (voice, image, Colab units).

## Done when

- `node video/tools/resolve.mjs --check` passes and `pnpm shots:sheet` shows all 47 shots rendering from real
  takes (no fixture fallback warnings, except shots listed as mock in the honesty sheet).
- `/?director=1&from=S01&to=S47` plays the whole film silently in the browser at the right timings.
- The Colab runtime and tunnels are stopped.
- Takes are committed without bulky artifacts (events + thumbnails only); the full artifacts stay local under
  the gitignored paths. `STATUS.md` says where.

## Hand off

`plan/STATUS.md`: take list with run ids, which shots are weak and why, what the author should re-record.
