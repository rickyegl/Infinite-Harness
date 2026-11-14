# reel.trailer

A launch trailer of the run's game in the studio's trailer recipe (`trailers/HOW_TO.md`): about 30 s, a 9:16 cut
and a 16:9 cut, music only, -14 LUFS.

- **Track:** the author's, in `assets/music/trailer.(wav|mp3|flac|m4a|ogg)` or `params.music`. Without it the
  cell stops and says so; it never makes up a track.
- **Footage:** three 24 s clips from the Unity game on autopilot at 1920x1080 with the HUD hidden (from the start,
  a loop, a twist or the drop), through the bridge's `play_capture` with `director` on: a capture-only camera
  operator (`Director.cs`) cuts every 3 to 4 s to the angle used longest ago (in front looking back, behind, low
  behind, overhead, alongside, three-quarter, a low kerb camera, high above, an orbit) on the fight most likely to
  happen next: a rider whose attack is ready and the kart it would go for, by the riders' own rules. It holds the
  shot until that attack has gone and landed. Every angle is held in track space, so the karts' steering never
  shakes the view; the angles off the road's line are used on flat road only, and the camera rises over a kart
  about to pass through it. Capture writes `events.json` (each cut, hit and attack, and whether it was on screen),
  kept as `footage/<clip>.json` with the footage key: a hash of the capture settings and the game's scripts. A
  clip is recorded again when the key changes. `params.footage` cuts given mp4 files instead.
- **Edit:** the studio's `beats.py` finds the beat grid; `edit.ts` splices the song so the drop lands near 43%,
  cuts on the beat (4-beat intro, slower build, the drop, 2-beat action, 1-beat flashes, a hero shot, the tail)
  and places the captions and the logo hit. With a clip's log, each shot stays inside one camera angle, is placed
  over the fights seen on screen (a hit counts more than an attack, which can miss), is never reused, and is
  framed towards them in the vertical cut. `logo.py` typesets the game's wordmark.
- **Render:** one `head.py` per aspect, joined to the studio's own `render_tail.py` and run in the project's
  `work/` folder (`sheet`, then `render`).
- **Evidence:** a gameplay storyboard, the fights on camera, the beat grid, the logo, each edit sheet, each video, the waveform.
- **Files:** `trailer-9x16.mp4`, `trailer-16x9.mp4`; `reel.json` for the Publish dry run.
