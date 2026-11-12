# 03. Game orchestrator: Unity and Roblox sub-orchestrators

**Goal:** "Make a racing game where humanoids fight while racing, on Unity and Roblox" produces two playable
games, each built by its own sub-orchestrator that draws its own tree, with editor screenshots as evidence.
This is the film's centrepiece: spend the effort here.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `plan/LOCAL.md` (editor paths, MCP servers
already configured for the worker CLIs, the Unity-to-Roblox porting project).

## Build

1. **`modules/game`** (orchestrator, cli-agent). Prompt file tells the worker to: write a one-page design
   (`design.md`: track, karts, combat rules, win condition, shared art list), then `spawn_task` the two engine
   orchestrators in parallel with that design, then report both links. It must `request_asset` for every model,
   texture, sound and music it wants instead of making placeholder art itself (plan 04 makes those real; until
   then the mock asset module answers).
2. **`modules/game.unity`** (orchestrator, cli-agent).
   - Creates a Unity 6 URP project from a template kept in `modules/game.unity/template/` (project settings,
     WebGL build profile, a `Harness` editor script folder).
   - Drives the editor through the Unity MCP/CLI integration. Launches the editor itself when it is not open
     (`paths.unityEditor`, `-projectPath`).
   - Sub-tasks as child cells via `spawn_task`: Track, Karts (arcade physics), Humanoids (riders with a simple
     melee), Combat, UI/HUD, Build. Each child attaches at least two viewport screenshots as `frames` evidence
     and reports steps as it goes.
   - Editor helper (`HarnessBridge.cs`): menu commands callable in batch mode for `Screenshot(path)`,
     `ImportAsset(path)`, `BuildWebGL(outDir)`, `PlayAndCapture(seconds, outDir)`.
   - Ends with a WebGL build in `artifacts/webgl/` and `publish_output("Play in browser", ...)` (plan 06 turns
     it into a public link).
3. **`modules/game.roblox`** (orchestrator, cli-agent).
   - Works in a Rojo project created from `modules/game.roblox/template/`; drives Roblox Studio through the
     Studio MCP server already configured for the workers; opens Studio if needed.
   - Same child cells as Unity, same evidence rule (Studio screen captures).
   - Ends with a saved place file and, when the author has approved publishing, a place link; otherwise a local
     play-test capture and a tile marked "ready to publish".
4. **Live direction** (`POST /runs/:id/say`). The game orchestrator stays addressable after it finishes. Each
   follow-up becomes a new child cell and must be fast:
   - "make it night" -> `Lighting` cell: Roblox lighting/skybox preset swap (and Unity skybox + light if asked).
   - "make it realistic" -> `Shaders` cell: enable a prepared URP volume profile, reflection probes, better
     lighting; before/after screenshots at the same camera.
   - "add music" -> `Music` cell: `request_asset("music")`, attach to both games.
   - "add crossplay" -> `Relay` cell: see below.
   Prepare these as scripted editor operations the agent calls, so they finish in seconds on a warm editor.
5. **Crossplay relay.** Tiny room server inside the bridge (`/relay`): WebSocket for the browser build, HTTP
   long-poll for the Roblox server (it can only make HTTP requests). Syncs kart id, position, rotation, 10 Hz.
   Each game renders remote karts as ghost riders. Roblox reaches the relay through the tunnel from plan 06;
   until then test with two browser tabs.
6. **Capture helpers.** `PlayAndCapture` on both engines records 10 s of gameplay to mp4 (ffmpeg screen region
   or engine recorder) and attaches it as `video` evidence: Act 2 and the trailer module need it.

## Verify first

- Which Unity automation is actually available on this machine (MCP server or CLI) and its real tool names;
  whether the WebGL module is installed for the chosen editor version (`USER-TODO` item 1). If not installed,
  build for Windows as the fallback and say so in `STATUS.md`.
- Roblox Studio MCP tool names and that Studio accepts them while in Edit mode.
- Roblox HTTP request limits and that `HttpService` is enabled in the place.
- How long a cold WebGL build takes here; if over 10 minutes, keep a warm project and build incrementally.

## Done when

- One prompt in the site produces a run with: Game cell, two engine orchestrators, at least five child cells
  each, screenshots in every child, a WebGL build that loads from `http://127.0.0.1:<bridge>/runs/<id>/artifacts/webgl/`
  and a Roblox place that plays.
- Both games: karts drive a lap, riders can hit each other, a hit has a visible effect, there is a finish.
- Each of the four follow-ups works on the finished run and adds its cell in under 20 s (music and crossplay
  may use mocks for the asset and the Roblox side until plans 04 and 06 land).
- Mock fixtures for `game`, `game.unity`, `game.roblox` are regenerated from this real run.

## Hand off

`plan/STATUS.md`: run id of the best run, build time, what is scripted versus agent-improvised, known rough
edges in gameplay.
