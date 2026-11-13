# Things only the author can do

Agents add items here instead of stopping. Tick them off as you go. "Blocks" says which plan cannot finish for
real (its mock path still works) until the item is done.

## Installs and sign-ins

| # | Item | Blocks |
|---|---|---|
| 1 | Unity Hub: add the **WebGL Build Support** module to the Unity 6 editor (6000.2.x). | 03 (browser build) |
| 2 | Install `cloudflared` and put it on PATH. | 06 (public link), crossplay with Roblox |
| 3 | Sign in to SurfaceCAD once and connect its MCP server (`https://surfacecad.com/mcp`) to the worker CLI that will run the CAD module. | 07 (CAD) |
| 4 | Cloudflare account login for Pages + a named tunnel (quick tunnels work without it). | 06 (site online) |
| 5 | Confirm the model proxy is running and the subscriptions are signed in. | 02 (router), 04 (images) |
| 6 | Say whether a Unity automation MCP/CLI is already set up on this machine, and where. | 03 |

## Paths to existing work ("almost copy paste")

Fill these into `harness.local.json` / `plan/LOCAL.md`, or tell the agent.

| # | What | Blocks |
|---|---|---|
| 7 | Image-to-video on Colab: notebook or launcher location and how it is started. | 04 (Video) |
| 8 | Forecast-model script or notebook, if one exists. | 07 (Forecast, Anomaly) |
| 9 | PCB tool or project, if one exists. Which board should the film show? | 07 (PCB), S38 |
| 10 | House floor-plan / DWG workflow, if one exists. | 07 (Drafting) |
| 11 | Which company's demand data to forecast (or accept the public default). | 07, S39-S40 |
| 12 | The FRC simulator clip of the drum shooter, once the CAD exists. | 08, S37 |

## For the film

| # | Item | Blocks |
|---|---|---|
| 13 | ~~Music~~: done. The score is approved (2026-11-12). Changes later are retuned in `video/score/cues.json`. | |
| 14 | Beat timings: fixed at 128 BPM. Nothing to do. | 08 (retiming), 09 |
| 15 | Voice lines recorded fast, one file per line named by shot (`S02.wav` ...) or one take -> `video/audio/voice/` | 08 (typing sync), 09 |
| 16 | "I'm not done" 1.5 s effect -> `video/audio/sfx/not_done.*` (the score has a rewind there until then) | 09 |
| 17 | ~~Chosen song~~: done, `video/makeasong.mp3`. Optional: a longer version in `assets/music/` for the games. | |
| 18 | Read `video/SHOTS.md` and change any shot, order or line you want before plan 01 starts. | 01 |

## Approvals agents will ask for (never assumed)

- Publishing the Roblox place (needed for a public Roblox link).
- Any upload, scheduling or account write on video platforms (the plans only do dry runs).
- Voice generation beyond about three full scripts in a session.
- Making the GitHub repo public.
