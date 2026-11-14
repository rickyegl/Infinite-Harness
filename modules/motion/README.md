# motion

Turns a short brief (a title card, kinetic type, a count-up, a lower third) into an HTML/GSAP composition and
renders it to an mp4 with the HyperFrames CLI. The building block for titles and cards in the reels and the film.

- **Steps:** a worker writes `index.html` in a fresh project folder (`runs/<run>/work/<node>-motion/`), following
  `prompt.md` and the studio's composition rules (the HyperFrames notes in the studio's `explainers/howto/`).
  `hyperframes check` runs next; the worker gets two goes at fixing what it finds. Then storyboard stills
  (`snapshot --at`), then `render`.
- **Offline:** the project gets a local copy of GSAP from `node_modules` instead of the CDN tag the CLI's `init`
  writes, remote files fail the check, and the CLI's telemetry, update check and auto-install are switched off.
- **Params:** `seconds` (default 3, or a length in the brief), `resolution` (`landscape` 1920x1080 by default,
  `portrait` 1080x1920 when the brief says vertical or 9:16, `square`), `fps` (30).
- **Evidence:** storyboard frames, then the clip. **Files:** `motion.mp4` first, then `index.html`.
- **Needs:** the HyperFrames CLI installed globally (`npm i -g hyperframes`) or `paths.hyperframes` pointing at its
  `bin/hyperframes.mjs`.

Measured: "title card that says READY" -> 3.0 s 1920x1080 clip; about 26 s writing, 9 s check, 20 s render.

Mock: `fixtures/default.jsonl`, recorded from that run.
