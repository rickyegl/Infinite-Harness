# 05. Trailer, reels, motion graphics and the ad campaign

**Goal:** the harness makes a game trailer, a Roblox premise reel, an explainer reel, an ad image and generic
motion-graphics clips, and a Campaign orchestrator that combines them, each narrated in the voice its studio
how-to names (changed by the author on 2026-11-13: not the cloned voice).

**Author's changes (2026-11-13), binding over anything below:**
- **Voices:** each reel uses the voice of its own studio recipe, not the cloned voice. Premise: the premise
  narrator, sped up as `premise/howto/script.md` §4 says. Explainer: the explainer narrator at normal speed, as
  `explainers/howto/script.md` §4 says. Voice and model ids live only in `harness.local.json` (placeholders in the
  example config), never in committed code or docs.
- **Premise opening:** the premise reel's script starts with "In this world," like every premise Short.
- **Length:** full-length reels, a bit shorter than each recipe's range, not 8-12 s demos. Targets: premise about
  30 s (recipe 35-45 s), explainer about 22-25 s (recipe 25-35 s), trailer about 30 s (recipe 40 s). `seconds`
  stays a parameter.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `plan/LOCAL.md`, then in `paths.studio`:
`STUDIO.md`, `trailers/HOW_TO.md`, `premise/HOW_TO.md`, `explainers/HOW_TO.md` and the HyperFrames notes under
`explainers/howto/`. Follow those documents: they are the tested recipe. Do not modify that project; call its
tools with their own working directory.

## Build

| Module | Label | Wraps | Output |
|---|---|---|---|
| `reel.trailer` | Trailer | Studio trailer tools: beat detection, beat-cut assembly, captions, logo ending. Input: gameplay captures from the game run (plan 03 `PlayAndCapture`), the game's music. | 16:9 trailer for the film + 9:16 cut |
| `reel.premise` | Premise Reel | Studio premise pipeline (Roblox Studio shots, narration, captions). A full premise Short of about 30 s built on the game's own place; the script opens "In this world,". Supports a `lighting: day/night` re-render for "make it night" (same narration, no new voice credits). | 9:16 mp4 |
| `reel.explainer` | Explainer | Studio explainer pipeline (HyperFrames composition + narration + captions). A full explainer of about 22-25 s. | 9:16 mp4 |
| `motion` | Motion | Generic HyperFrames module: prompt -> HTML/GSAP composition -> mp4. The reusable building block (also used for the film's own titles in plan 09). | mp4 |
| `ad.image` | Ad Image | `assets.image` with a campaign brief and platform sizes. | PNGs |
| `campaign` | Campaign | Orchestrator (cli-agent): writes one brief per audience (Unity players, Roblox players), spawns Explainer, Premise Reel, Ad Image and Trailer cut, requests `voice` for narration (with each reel's own voice preset), publishes the set to the wall. | tiles |
| `publish` | Publish | Studio scheduling tools in **dry-run only**. Shows the planned slots as evidence. | plan table |

1. Evidence matters more than length: every reel module streams storyboard frames, the narration waveform, the
   beat grid with cut markers, then the finished clip. Those are the pictures Act 2 zooms into.
2. Reels are full length (see the author's changes above) and parameterised (`seconds`, `lang`, `lighting`).
   A follow-up re-render reuses the cached narration and the built sets, so it costs no voice credits; it will
   not always finish in under a minute. Cache narration by script text and voice preset.
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
- "Make an ad campaign for Unity and Roblox players" yields: one explainer reel, one premise reel (opening
  "In this world,"), one ad image per audience, each reel narrated in its recipe's voice, all on the wall, with
  the Campaign subtree visible in the graph.
- "Make it night" on the premise reel re-renders the night variant and attaches before/after.
- `motion` turns "title card that says READY" into a 3 s mp4.
- `publish` shows a dry-run plan and performs no network writes (assert in a test by running it with networking
  to the platforms' hosts blocked or by checking the tool's dry-run output marker).
- Fixtures regenerated; voice credits used are written to `STATUS.md`.

## Hand off

`plan/STATUS.md`: render times, paths of the best outputs, credits used, anything still on mock.
