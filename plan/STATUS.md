# Status

Every agent updates this file at the end of its plan: what is done, how it was verified, open problems, and
what the next agent should know. Keep it short; replace stale lines instead of appending forever.

## Now

- **Done:** repository created; film shot layout (`video/SHOTS.md`, `video/shots.json`, resolver script);
  plan files 00-10; music marker tool; text-card preview render; **film re-cut faster on one steady tempo**
  (128 BPM, 73 bars, 2:17). 3:00 is a limit, not a target. **First score** built from generated takes and
  in the preview (`video/tools/score.py`, `video/score/cues.json`).
- **Next:** author reviews `video/SHOTS.md` and `plan/USER-TODO.md`, then plan 01.
- **Not started:** all application code.

## Verified

- `node video/tools/resolve.mjs`: 47 shots, 73 bars, 136.9 s; fastest voice line 2.9 words per second.
- `node video/tools/preview.mjs` renders `video/renders/shots-preview.mp4` with `score.wav` (duration checked
  with ffprobe against `timeline.json`).
- `python video/tools/score.py`: every take measured at 128.0 BPM; each cue's span within 8 ms of the grid.
  Not yet checked by ear.

## Decisions by the author (2026-11-11)

- Deadline: 3 days. Most module internals already exist in other projects; expect wrap-and-wire work.
- Film: record real runs, replay on the beat clock; edit with HyperFrames.
- Agents: headless CLI workers.
- Unity: Unity 6 + WebGL module.
- (2026-11-12) The two generated full-length tracks are dropped: their arc did not match the shots. The music
  is now scored to the film in short cues (see "Music cues" in `video/SHOTS.md`). The opening prompt is read in
  18-20 s. The film has no minimum length.

## ASSUMED (see the list at the end of 00-contract.md)

Nothing beyond that list yet.

## Open problems

- The score is unheard by its author: beat 1 is detected, not confirmed, for each take (the second drop was
  moved two beats on the detector's evidence). `video/tools/marker.html` still offers the old two-track marks.
- The opening line no longer asks for a cloned voice, but the Voice cell still appears in S09 and S16.
- Audio files are not in git (`video/audio/` is ignored).
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
