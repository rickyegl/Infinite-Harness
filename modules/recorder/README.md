# recorder

A 20-30 s video of how the run went, for showing the process. It waits for every other cell (the Verifier
too), then films the stage's automatic cut of the run (`?director=1&run=<id>`):

- **The graph:** the run's events spread evenly over the shot, so busy stretches get the time and idle hours
  vanish. The camera starts wide, visits the busiest cell of each third of the run (after it appears), then
  goes wide again.
- **The wall:** up to 12 things the run published, the ones with a picture first (left out when nothing was
  published).
- **Sound:** the chosen song (`video/makeasong.mp3`), faded in and out. `params.music: "none"` leaves it
  silent.

Capture is frame by frame through `video/tools/capture.mjs` (12 fps at 1920x1080 by default: about 30-45 s for
a 24 s video). The same thing from the command line is `pnpm record --run <id>` (token from `HARNESS_TOKEN`).

- **Params:** `dur` (20-30 s, default 24), `fps`, `scale`, `music`, `waitMs`.
- **Evidence and output:** the mp4 ("Process video").
