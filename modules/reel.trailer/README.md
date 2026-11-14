# reel.trailer

A launch trailer of the run's game in the studio's trailer recipe (`trailers/HOW_TO.md`): about 30 s, a 9:16 cut
and a 16:9 cut, music only, -14 LUFS.

- **Track:** the author's, in `assets/music/trailer.(wav|mp3|flac|m4a|ogg)` or `params.music`. Without it the
  cell stops and says so; it never makes up a track.
- **Footage:** three fresh 12 s clips from the Unity game on autopilot at 1920x1080 with the HUD hidden (the start,
  a loop, a twist or the drop), through the bridge's `play_capture`. `params.footage` cuts given mp4 files instead.
- **Edit:** the studio's `beats.py` finds the beat grid; `edit.ts` splices the song so the drop lands near 43%,
  cuts on the beat (4-beat intro, slower build, the drop, 2-beat action, 1-beat flashes, a hero shot, the tail)
  and places the captions and the logo hit. `logo.py` typesets the game's wordmark.
- **Render:** one `head.py` per aspect, joined to the studio's own `render_tail.py` and run in the project's
  `work/` folder (`sheet`, then `render`).
- **Evidence:** a gameplay storyboard, the beat grid, the logo, each edit sheet, each video, the waveform.
- **Files:** `trailer-9x16.mp4`, `trailer-16x9.mp4`; `reel.json` for the Publish dry run.
