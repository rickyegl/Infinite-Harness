# Infinite Harness

**The Everything Harness.** One clean text box. Type or say anything; the harness picks the module agents for
the job, starts them, and shows them working as a living graph instead of a chat.

The showcase: ask for a racing game and watch one orchestrator build it in Unity and Roblox at the same time,
request models and music from asset agents, cut a trailer, produce an ad campaign in your own voice, host the
game in the browser and verify the lot. Then keep going: images, CAD, 3D, study guides, forecasts.

> Status: the stage renders the whole film from fixture events, the bridge runs real prompts, and the game
> agents build the racing game in Unity and Roblox (`modules/game*`). The other modules come next. See
> [plan/STATUS.md](plan/STATUS.md).

## How it works

```
prompt -> router -> module cells (agents, tools, sub-orchestrators) -> event stream -> the stage
```

- Every run is an append-only stream of events. The interface is a pure function of those events and a clock,
  so a run can be watched live or replayed exactly.
- A sub-orchestrator is a cell that grows its own tree in the same visual grammar, and any agent can ask
  another module for an asset.
- Most work happens on your own computer through a local bridge; heavy GPU jobs go to a cloud runtime and
  public links go through tunnels.

## Repository

| Path | What |
|---|---|
| [video/SHOTS.md](video/SHOTS.md) | The demo film (3 minutes at most), shot by shot, keyed to the music's beats. The product is designed from it. |
| [plan/](plan/README.md) | Ordered build plan, one file per agent session. |
| [apps/web](apps/web) | The stage: the interface, a pure function of events and a clock. |
| [apps/bridge](apps/bridge/README.md) | The local daemon: routes a prompt to modules and agent workers, records and streams the run. |
| `modules/` | One folder per module (`module.json`, `run.ts` or `prompt.md`, fixtures). |
| [packages/protocol](packages/protocol) | Event and manifest types, and `reduce(events, t)`. |
| `video/direction/` | One direction file per shot: view, camera and how the shot reads its take. |
| `harness.config.example.json` | Configuration template. |

## Running the stage

```bash
pnpm install
pnpm dev
```

This starts the bridge and the site. `http://127.0.0.1:5173/` is the prompt screen: pair it once (`pnpm pair`
prints the link, or the gear opens the settings sheet), type or say a prompt and watch the run's graph. With
`HARNESS_MOCK=1` nothing real is called. See [apps/bridge/README.md](apps/bridge/README.md).

Without the bridge, open `http://127.0.0.1:5173/?fixture=main&start=40000` (live: click a cell to focus it, Escape to go back)
or `http://127.0.0.1:5173/?director=1&shot=S11` (one shot of the film; `&from=S09&to=S20` for a range,
`&play=1` to play it).

| Command | What |
|---|---|
| `pnpm shots:sheet` | Contact sheets of every shot: `video/renders/sheet_*.png`. |
| `pnpm film:rough` | The rough cut, captured frame by frame with the click track and score: `video/renders/rough.mp4`. |
| `node video/tools/capture.mjs --shot S11` | One shot (or `--from`/`--to`) at 60 fps, full size. |
| `pnpm shots:direct` | Draft direction files for shots that have no hand-tuned one. |
| `pnpm test`, `pnpm test:determinism`, `pnpm test:live` | Unit tests, byte-identical seeks, the live click-through. |
| `pnpm lint:brand` | No vendor or model names in the repo. |

The capture tools need Playwright's Chromium (`pnpm exec playwright install chromium`) and ffmpeg (on `PATH`,
`FFMPEG`, or `paths.ffmpeg` in `harness.local.json`).

## Film timing

```bash
node video/tools/resolve.mjs
```

Resolves the shot layout against `video/beats.json` and regenerates the shot table.

For a quick animatic of the layout (one text card per shot, flash on every cut, click track):

```bash
node video/tools/preview.mjs
```

It writes `video/renders/shots-preview.mp4`.

The music is scored to the film in short cues on the 128 BPM grid. `video/score/cues.json` lists the takes and
which bars play where; `python video/tools/score.py` builds `video/audio/score.wav` from locally generated
takes and checks every cue against the grid.

Built with AI.
