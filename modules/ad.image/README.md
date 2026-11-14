# ad.image

One ad for one audience at each platform size. The picture is an asset request to Image (so the hand-off shows
in the graph), asked for with no text in it; the headline and the call to action are set by `compose.py`, so the
words are always spelled right. Each size is cropped to exact pixels.

- **Formats:** `feed` 1080x1080 and `story` 1080x1920 by default; `link` 1200x628 on request
  (`params.formats`). One picture per aspect.
- **Params:** `headline` (else a quoted phrase in the brief, else a default line), `cta` (default
  "Play now"), `audience`, `formats`.
- **Look:** a dark gradient behind the headline at the top, an amber call-to-action pill near the bottom.
  No pink or magenta.
- **Evidence:** each size as an image. **Files:** `ad-feed.png`, `ad-story.png` (and `ad-link.png`).

Checked: the layout on an earlier Image picture, both sizes. The first full run waited on the image model's
quota (2026-11-14); see `plan/STATUS.md`.

On a run with a game, the picture brief describes the game (its kart, a rider, the track and its colours) so the
ad shows the karts, not a generic scene.
