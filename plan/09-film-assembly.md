# 09. Assemble the film

**Goal:** `video/renders/infinite-harness-demo.mp4`: 1920x1080, 60 fps, 180 s, every cut on the beat, voice,
music and effects mixed.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, [video/SHOTS.md](../video/SHOTS.md), and
the HyperFrames notes in `paths.studio` (`explainers/howto/visuals.md` and the HyperFrames project guide next
to it). The trailer recipe in `trailers/HOW_TO.md` section 1 is the pacing reference: cuts about 30 ms before
the beat, flash + shake + punch-in on the drop, slower and dimmer before it.

## Build

1. **Real beat grid.** Put the author's timings in `video/beats.json` (explicit `beats` list), run
   `node video/tools/resolve.mjs`. Fix what it reports by adding or removing bars in elastic shots in
   `shots.json`. Re-run retime for affected takes.
2. **Plates.** `video/tools/capture.mjs` (from plan 06): for each shot, open
   `/?director=1&shot=<id>`, step `window.__harness.seek(t)` frame by frame at 60 fps, screenshot, encode to
   `video/plates/<id>.mp4` (visually lossless) with 12 frames of handle at both ends. Parallelise across shots.
   Capture transparent-background variants for shots composited over others (S30).
3. **HyperFrames project** `video/film/`: one composition, 1920x1080, 180 s.
   - A track of plates placed from `timeline.json` with `LEAD = 0.03` s.
   - Film-level layers that are not part of the product UI: beat flashes, shake, punch-ins, the fake-ending
     fade (S26), the glitch/rewind (S27), act-6 title words, the final wordmark (S46-S47), safe margins.
   - Text uses the same fonts and tokens as `apps/web/src/theme.ts` (import the tokens, do not retype them).
4. **Audio** (ffmpeg, scripted in `video/tools/mix.mjs`): music at full level; voice lines placed at their
   shots' start with sidechain-style ducking of the music under speech; the 1.5 s effect at S27; the 4 s song
   clip in S24 with the demo track ducked and filtered under it; short UI ticks on chip pops and cell spawns
   kept quiet and on-grid; loudness normalised to about -14 LUFS, true peak under -1 dB.
5. **Render and QA.**
   - `pnpm film` runs capture -> HyperFrames render -> mix -> mux.
   - `video/tools/qa.mjs`: checks duration (180 +/- 0.1 s), resolution, fps, audio present; extracts a frame at
     every cut and at every downbeat of the drops into contact sheets; lists cuts further than 1 frame from
     `beat - LEAD`.
   - Watch it once at full speed, once at 0.5x. Fix timing in direction files, not in the edit.
6. **Variants.** A 30 s vertical teaser cut from Acts 1, 2 and 5 (`motion` module can do the titles) if time
   allows. Lowest priority.

## Verify first

- HyperFrames can place external mp4 plates frame-accurately and render 180 s at 60 fps in one pass here; if
  not, render per act and concatenate with ffmpeg (stream copy at act boundaries on beats).
- Whether HyperFrames can drive the app page directly (skip plates). Only switch if it works on the first try.
- The music file's sample rate and that the beat list's first entry matches its first downbeat.

## Done when

- `pnpm film` produces the mp4 from a clean checkout plus the local takes, with no manual steps.
- `qa.mjs` passes; the contact sheet of cut frames shows the right shot on each cut.
- The author has watched it and signed off, or their notes are in `STATUS.md` as a fix list.
- No vendor or model name is visible in any frame (scan the cut-frame sheets).

## Hand off

`plan/STATUS.md`: render time, final file path, QA results, fix list.
