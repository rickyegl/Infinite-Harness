# Status

Every agent updates this file at the end of its plan: what is done, how it was verified, open problems, and
what the next agent should know. Keep it short; replace stale lines instead of appending forever.

## Now

- **Done:** repository created; film shot layout (`video/SHOTS.md`, `video/shots.json`, resolver script);
  plan files 00-10; music marker tool; text-card preview render; **Track A chosen** and acts 1-4 re-fitted to
  its measured beat grid (95 bars, 179.1 s).
- **Next:** author reviews `video/SHOTS.md` and `plan/USER-TODO.md`, then plan 01.
- **Not started:** all application code.

## Verified

- `node video/tools/resolve.mjs`: 47 shots, 95 bars, 179.1 s; no voice line above 4.2 words per second.
- Track A grid (beat 0.4710 s, first beat 0.108 s) measured with the studio's beat finder and cross-checked
  against hand marks: drop 0:32.1, big hit 0:47.2, second drop 1:09.8, resolve 1:24.9, beat ends 1:32.4.
- `node video/tools/preview.mjs` renders `video/renders/shots-preview.mp4` with Track A mixed in.

## Decisions by the author (2026-11-11)

- Deadline: 3 days. Most module internals already exist in other projects; expect wrap-and-wire work.
- Film: record real runs, replay on the beat clock; edit with HyperFrames.
- Agents: headless CLI workers.
- Unity: Unity 6 + WebGL module.

## ASSUMED (see the list at the end of 00-contract.md)

Nothing beyond that list yet.

## Open problems

- Track B is not chosen: bars 51-95 use Track A's tempo as a placeholder. When it is chosen, measure it, set
  the second segment and a second `music` entry in `video/beats.json`, re-run the resolver.
- Music files are not in git (audio under `video/audio/` is ignored); a fresh clone has no music.
- Unity automation path on this machine is unconfirmed (USER-TODO 6).
- `cloudflared` is not installed (USER-TODO 2). Unity 6 has no WebGL module yet (USER-TODO 1).

## Per-plan log

| Plan | State | Verified by | Notes |
|---|---|---|---|
| 01 | not started | | |
| 02 | not started | | |
| 03 | not started | | |
| 04 | not started | | |
| 05 | not started | | |
| 06 | not started | | |
| 07 | not started | | |
| 08 | not started | | |
| 09 | not started | | |
| 10 | not started | | |
