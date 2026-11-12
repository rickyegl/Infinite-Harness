# Status

Every agent updates this file at the end of its plan: what is done, how it was verified, open problems, and
what the next agent should know. Keep it short; replace stale lines instead of appending forever.

## Now

- **Done:** repository created; film shot layout (`video/SHOTS.md`, `video/shots.json`, resolver script);
  plan files 00-10.
- **Next:** author reviews `video/SHOTS.md` and `plan/USER-TODO.md`, then plan 01.
- **Not started:** all application code.

## Verified

- `node video/tools/resolve.mjs`: 47 shots, 96 bars, 180.0 s on the placeholder 128 BPM grid; no voice line
  above 4.2 words per second.

## Decisions by the author (2026-11-11)

- Deadline: 3 days. Most module internals already exist in other projects; expect wrap-and-wire work.
- Film: record real runs, replay on the beat clock; edit with HyperFrames.
- Agents: headless CLI workers.
- Unity: Unity 6 + WebGL module.

## ASSUMED (see the list at the end of 00-contract.md)

Nothing beyond that list yet.

## Open problems

- Placeholder beat grid: real timings will move every shot; re-run the resolver when they arrive.
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
