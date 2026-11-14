# Things only the author can do

Agents add slow items here (installs, recordings, files to supply) and carry on with other work. Tick them off
as you go. "Blocks" says which plan cannot finish for real (its mock path still works) until the item is done.
For something needed right now (a program to open, a runtime to start, a sign-in, a question), an agent may
stop and ask you directly: see `AGENTS.md` rule 5 and "Waiting on the author" in `plan/STATUS.md`.

## Installs and sign-ins

| # | Item | Blocks |
|---|---|---|
| 1 | Unity Hub: add the **WebGL Build Support** module to the Unity 6 editor (6000.2.x). The install was approved in plan 03, but the Windows admin prompt was cancelled; click Yes on it next time. | 03 (browser build) |
| 2 | ~~Install `cloudflared`~~: done in plan 06 (portable exe in `runs/.tools/`, set in `harness.local.json`). | |
| 3 | Sign in to SurfaceCAD once and connect its MCP server (`https://surfacecad.com/mcp`) to the worker CLI that will run the CAD module. | 07 (CAD) |
| 4 | ~~Cloudflare login for Pages~~: done; the site is at https://infinite-harness.pages.dev. A named tunnel (a fixed address) is optional; quick tunnels work without it. | |
| 21 | Plan 06 checks on your own devices: a Host "Play in browser" link on your phone over mobile data (needs item 1), and the deployed site on another device paired with `pnpm bridge:public`. | 06 (sign-off) |
| 5 | Confirm the model proxy is running and the subscriptions are signed in. | 02 (router), 04 (images) |
| 6 | ~~Unity automation~~: done in plan 03 (the harness drives the open editor through a file queue). | |
| 20 | Open the latest `runs/<id>/artifacts/game.roblox.build/place.rbxlx` in Roblox Studio and press Play (you chose "Unity only for now"). Turn on HttpService if you want crossplay. | 03 (Roblox play test) |

## Paths to existing work ("almost copy paste")

Fill these into `harness.local.json` / `plan/LOCAL.md`, or tell the agent.

| # | What | Blocks |
|---|---|---|
| 7 | Image-to-video on Colab: which notebook or launcher is the one to use, and how it is started. Found so far (plan 04): the forge's `launcher/h3` sets up a node-graph server with an image-to-video model, about 65 GB of weights to download; `launcher/qwen` is a chat notebook, not video. `plan/LOCAL.md` names a different video model. Until then the Video cell is the mock. | 04 (Video) |
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
| 19 | Maker icons: one small SVG glyph per non-LLM generator -> `apps/web/public/makers/<id>.svg` (ids and the list are in `plan/LOCAL.md`). Supply them or approve the ones an agent proposes. Until then those cells show a neutral glyph. | 08 (real takes) |

## Approvals agents will ask for (never assumed)

- Publishing the Roblox place (needed for a public Roblox link).
- Any upload, scheduling or account write on video platforms (the plans only do dry runs).
- Voice generation beyond about three full scripts in a session.
- Making the GitHub repo public.
