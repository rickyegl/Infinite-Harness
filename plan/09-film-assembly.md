# 09. The final cut

**Goal:** `video/renders/infinite-harness-demo.mp4`: 1920x1080, 60 fps, as long as `total` in `video/timeline.json` (180 s at most), every cut on the beat, voice,
music and effects mixed. A rough cut (`pnpm film:rough`) has existed since plan 01; this plan replaces it with
full-quality plates, film-level layers in HyperFrames and the real mix.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, [video/SHOTS.md](../video/SHOTS.md), and
the HyperFrames notes in `paths.studio` (`explainers/howto/visuals.md` and the HyperFrames project guide next
to it). The trailer recipe in `trailers/HOW_TO.md` section 1 is the pacing reference: cuts about 30 ms before
the beat, flash + shake + punch-in on the drop, slower and dimmer before it.

## Build

1. **Beat grid.** Fixed at 128 BPM in `video/beats.json`; the score is built on it. Only after a shot change:
   run `node video/tools/resolve.mjs`, fix what it reports by adding or removing bars in elastic shots in
   `shots.json`, shift the affected cues in `video/score/cues.json`, rebuild the score
   (`python video/tools/score.py`) and re-run retime for affected takes.
2. **Plates.** `video/tools/capture.mjs` (from plan 01), now at full quality: for each shot, open
   `/?director=1&shot=<id>`, step `window.__harness.seek(t)` frame by frame at 60 fps, screenshot, encode to
   `video/plates/<id>.mp4` (visually lossless) with 12 frames of handle at both ends. Parallelise across shots.
   Capture transparent-background variants for shots composited over others (S30).
3. **HyperFrames project** `video/film/`: one composition, 1920x1080, `total` seconds long.
   - A track of plates placed from `timeline.json` with `LEAD = 0.03` s.
   - Film-level layers that are not part of the product UI: beat flashes, shake, punch-ins, the fake-ending
     fade (S26), the glitch/rewind (S27), act-6 title words, the final wordmark (S46-S47), safe margins.
   - Text uses the same fonts and tokens as `apps/web/src/theme.ts` (import the tokens, do not retype them).
4. **Audio** (ffmpeg, scripted in `video/tools/mix.mjs`): the music is `video/audio/score.wav`, approved by
   the author on 2026-11-12. It already holds the hits, risers, the rewind and the S24 song
   (`video/makeasong.mp3` with the score ducked under it), so do not add those again. Put the author's 1.5 s
   S27 effect in `cues.json` `clips` at bar 40 beat 1 and rebuild the score, rather than placing it in the mix.
   The mix adds voice lines at their shots' start with sidechain-style ducking of the score under speech, and
   short UI ticks on chip pops and cell spawns, kept quiet and on-grid. Loudness is normalised to about
   -14 LUFS with true peak under -1 dB.
5. **Render and QA.**
   - `pnpm film` runs capture -> HyperFrames render -> mix -> mux.
   - `video/tools/qa.mjs`: checks duration (`total` +/- 0.1 s), resolution, fps, audio present; extracts a frame at
     every cut and at every downbeat of the drops into contact sheets; lists cuts further than 1 frame from
     `beat - LEAD`.
   - Watch it once at full speed, once at 0.5x. Fix timing in direction files, not in the edit.
6. **Variants.** A 30 s vertical teaser cut from Acts 1, 2 and 5 (`motion` module can do the titles) if time
   allows. Lowest priority.

## Verify first

- HyperFrames can place external mp4 plates frame-accurately and render the whole film at 60 fps in one pass here; if
  not, render per act and concatenate with ffmpeg (stream copy at act boundaries on beats).
- Whether HyperFrames can drive the app page directly (skip plates). Only switch if it works on the first try.
- `score.wav` is exactly `total` seconds long and starts on bar 1 (re-run `score.py`, which checks every cue
  against the grid).

## Done when

- `pnpm film` produces the mp4 from a clean checkout plus the local takes, with no manual steps.
- `qa.mjs` passes; the contact sheet of cut frames shows the right shot on each cut.
- The author has watched it and signed off, or their notes are in `STATUS.md` as a fix list.
- No vendor or model name is visible in any frame (scan the cut-frame sheets).

## Hand off

`plan/STATUS.md`: render time, final file path, QA results, fix list.
