# Explainer visuals

You make the picture for a vertical "What if" explainer Short as one HyperFrames composition, timed to a narration
that is already recorded. Write `visuals_hf/index.html` and `visuals_hf/cues.json` in your working folder and
nothing else. Do not run commands and do not fetch anything. A reference composition from an explainer that
shipped is at `{{REFERENCE}}`: read it for the structure and the scene kit, but make your own scenes (and never
show a star count).

## The recipe (the studio's route A)

- One `<section class="clip">` per shot, a cut every ~2.7 s (1.8-3.3 s), each starting on a word time from the
  timings below. About {{SHOTS}} shots.
- **The premise is on screen at frame 0 with no entrance**: something already moving, the hook's key words big.
- Inside each section a `.cam` div with a slow push-in (scale 1 to 1.07 over the shot) so the camera never sits
  still; put `data-layout-allow-overlap data-layout-allow-occlusion data-layout-allow-overflow` on each `.cam`.
- Every hit lands on a word: a stamp slams on its word, a counter runs on its number, a key pops on its line. Use
  the absolute word times below as tween positions on the one root timeline.
- Kinetic text for the numbers and the reveal; alternate wide shots with close-ups (cutaways, "X-ray" views,
  scale comparisons). Something on screen on every frame: an empty frame before a slam reads as dead air.
- Keep the visuals in **y 150-1150**: captions are added later around y 1160-1360, and the phone UI covers the
  bottom fifth and the right edge. Keep tags and pills 40 px inside the frame; text at most 930 px wide with
  `white-space: nowrap`.
- Font: Lilita One from `assets/LilitaOne.ttf` (already in the folder) with an `@font-face`. Emoji need no font:
  do not use emoji or symbols in the frame.
- **No captions** in the composition (the assembler burns them in). No on-screen credits or source notes.
- Do not tween `letterSpacing` or other layout properties (split letters into spans and tween `x`). No GSAP
  `keyframes:` inside a `fromTo` with other props. A late tween needs `immediateRender: false` if its `from` state
  must not show early.

## Sound cues: `visuals_hf/cues.json`

A sound on every cut and every pop, about two a second: `[{"t": 0.03, "cue": "movie-whoosh-impact-presentation-2903"}, ...]`
with `t` in seconds and `cue` one of these files in the studio's sound library (no other sounds exist):

{{SOUNDS}}

Good matches: hook = movie-whoosh-impact-presentation-2903, slam = short-bass-hit-2299, scene slide =
air-woosh-1489 / fast-whoosh-transition-1490, reveal = explainer-video-game-reveal-235, key = hard-single-key-press-in-a-laptop-2542,
it works = success-software-tone-2865, big number = winning-chimes-2015, payoff = crystal-chime-3108.
The first cue is at about 0.03 s.

## Rules

{{RULES}}

## The script

{{SCRIPT}}

## Word timings (seconds)

{{WORDS}}

When you are done, answer in one sentence describing the shots.
