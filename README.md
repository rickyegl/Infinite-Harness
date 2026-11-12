# Infinite Harness

**The Everything Harness.** One clean text box. Type or say anything; the harness picks the module agents for
the job, starts them, and shows them working as a living graph instead of a chat.

The showcase: ask for a racing game and watch one orchestrator build it in Unity and Roblox at the same time,
request models and music from asset agents, cut a trailer, produce an ad campaign in your own voice, host the
game in the browser and verify the lot. Then keep going: images, CAD, 3D, study guides, forecasts.

> Status: planning complete, implementation starting. See [plan/STATUS.md](plan/STATUS.md).

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
| [video/SHOTS.md](video/SHOTS.md) | The 3-minute demo film, shot by shot, keyed to the music's beats. The product is designed from it. |
| [plan/](plan/README.md) | Ordered build plan, one file per agent session. |
| `harness.config.example.json` | Configuration template. |

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

To choose and time the music, open `video/tools/marker.html` in a browser: load candidate tracks, tap the beat,
mark the drop, breaks, hits and ending, then copy the marks as JSON.

Built with AI.
