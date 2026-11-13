# 05. Trailer, reels, motion graphics and the ad campaign

**Goal:** the harness makes a game trailer, a Roblox premise reel, an explainer reel, an ad image and generic
motion-graphics clips, and a Campaign orchestrator that combines them with the cloned voice.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `plan/LOCAL.md`, then in `paths.studio`:
`STUDIO.md`, `trailers/HOW_TO.md`, `premise/HOW_TO.md`, `explainers/HOW_TO.md` and the HyperFrames notes under
`explainers/howto/`. Follow those documents: they are the tested recipe. Do not modify that project; call its
tools with their own working directory.

## Build

| Module | Label | Wraps | Output |
|---|---|---|---|
| `reel.trailer` | Trailer | Studio trailer tools: beat detection, beat-cut assembly, captions, logo ending. Input: gameplay captures from the game run (plan 03 `PlayAndCapture`), the game's music. | 16:9 trailer for the film + 9:16 cut |
| `reel.premise` | Premise Reel | Studio premise pipeline (Roblox Studio shots, narration, captions). Demo scope: a **short** 8-12 s premise ad built on the game's own place. Supports a `lighting: day/night` re-render for "make it night". | 9:16 mp4 |
| `reel.explainer` | Explainer | Studio explainer pipeline (HyperFrames composition + narration + captions). Demo scope: 8-12 s. | 9:16 mp4 |
| `motion` | Motion | Generic HyperFrames module: prompt -> HTML/GSAP composition -> mp4. The reusable building block (also used for the film's own titles in plan 09). | mp4 |
| `ad.image` | Ad Image | `assets.image` with a campaign brief and platform sizes. | PNGs |
| `campaign` | Campaign | Orchestrator (cli-agent): writes one brief per audience (Unity players, Roblox players), spawns Explainer, Premise Reel, Ad Image and Trailer cut, requests `voice` for narration, publishes the set to the wall. | tiles |
| `publish` | Publish | Studio scheduling tools in **dry-run only**. Shows the planned slots as evidence. | plan table |

1. Evidence matters more than length: every reel module streams storyboard frames, the narration waveform, the
   beat grid with cut markers, then the finished clip. Those are the pictures Act 2 zooms into.
2. Keep demo reels short and parameterised (`seconds`, `lang`, `lighting`) so a re-render after a follow-up
   takes under a minute where possible. Cache narration by script hash to save credits.
3. Reuse the studio's `new` project lifecycle so outputs land in its normal folders; copy only the final mp4 and
   preview frames into the run's `artifacts/`.
4. The explainer and premise pipelines have a "stop for the author's go" gate after the script. Keep it: in the
   harness that gate is a `waiting` state on the cell with the script as `doc` evidence and Approve in the focus
   view. `HARNESS_AUTO_APPROVE=1` (set only for take capture, with the author present) skips it.

5. The film's S24b shows the trailer's 9:16 cut, the explainer and the premise reel (night version) side by
   side, one bar of each one's sound in turn. So each reel's first 2 s must already sound like it (no silent
   lead-in), and all three must be 9:16. Hand-off: copy the three mp4s' audio to `video/audio/reels/`.

## Verify first

- The studio tools' current command lines (they changed recently per its docs): run each with `--help`.
- HyperFrames CLI is installed and renders offline or needs network (its docs say GSAP loads from a CDN).
- Roblox Studio must not be in Play mode and the monitor layout must not change during premise capture (studio
  rules).
- ASK the author before any real upload, scheduling or account action. This plan never publishes.

## Done when

- A game run followed by "make a trailer" yields a beat-cut trailer from that run's own gameplay.
- "Make an ad campaign for Unity and Roblox players using my voice" yields: one explainer reel, one premise
  reel, one ad image per audience, narrated in the cloned voice, all on the wall, with the Campaign subtree
  visible in the graph.
- "Make it night" on the premise reel re-renders the night variant and attaches before/after.
- `motion` turns "title card that says READY" into a 3 s mp4.
- `publish` shows a dry-run plan and performs no network writes (assert in a test by running it with networking
  to the platforms' hosts blocked or by checking the tool's dry-run output marker).
- Fixtures regenerated; voice credits used are written to `STATUS.md`.

## Hand off

`plan/STATUS.md`: render times, paths of the best outputs, credits used, anything still on mock.
