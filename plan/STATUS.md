# Status

> **packages/protocol changed (plan 06):** `ModuleContext` gained `ask(node, input)` (send work back to a finished
> cell of the run: it reruns in place with its first input plus `params.fix`, between `node.request` and
> `node.deliver`) and `mark(node, title, detail?, icon?)` (a step on another cell: the Verifier's check mark).
> Additive only; no event type changed.
>
> **packages/protocol changed (plan 03):** `ModuleManifest` gained an optional `hidden?: boolean` (a part of
> another module, spawned by its parent's `run.ts`, never offered to the router); `checkManifest` checks its type.
> Additive only; no event type changed.
>
> **packages/protocol changed (plan 02):** `src/manifest.ts` gained the types a module's `run.ts` receives:
> `ModuleContext`, `AgentOptions`, `AgentResult`, `ShResult`, `ModuleRun`. Additive only; no event type changed.
>
> **packages/protocol changed (plan 01, commit 19ca915):** the package was created: event and manifest types
> from the contract and `reduce(events, t)`. Modules import their types from `@harness/protocol`.

Every agent updates this file at the end of its plan: what is done, how it was verified, open problems, and
what the next agent should know. Keep it short; replace stale lines instead of appending forever.

## Now

- **Done:** repository created; film shot layout (`video/SHOTS.md`, `video/shots.json`, resolver script);
  plan files 00-10; text-card preview render; **film re-cut faster on one steady tempo**
  (128 BPM, 75 bars, 2:21). 3:00 is a limit, not a target. **Score approved** by the author (2026-11-12):
  built from generated takes plus the chosen song (`video/tools/score.py`, `video/score/cues.json`).
- **Done (plan 01):** the stage. `apps/web` renders all 48 shots from fixture events and a clock, with no
  backend: eight views, camera, director and live modes, fixtures for every take, draft and hand-tuned direction
  files, contact sheets, the rough cut, determinism and live tests. Details under "The stage" below.
  The author looked at it and liked it (2026-11-12).
- **Done (plan 02):** the bridge (`apps/bridge`): runs a prompt through the router, modules and headless
  workers, stores and streams events; the site's live mode posts prompts and draws the run as it happens;
  `pnpm take` turns a run into a take that replays offline. Details under "The bridge" below.
- **Done (plan 03), with two fallbacks:** the game agents. One prompt builds the game in Unity and Roblox,
  with six part cells under each engine, and four live follow-ups (night, realistic, music, crossplay) through
  the relay at `/relay`. Fallbacks: a Windows build instead of WebGL (the WebGL module is not installed), and a
  Roblox place that the pipeline builds and lints but does not open in Studio (it has been played there once by
  hand, with the generated models). Details under "The games" below.
- **Done (plan 04), video on mock:** the asset modules. Image, Image Edit, Cutout, Music and Voice run for real;
  "show me a house", "make the walls red", "transparent background" chain without paths. Video stays on the mock
  until the author picks its runtime (USER-TODO 7). Details under "The assets" below.
- **Done (plan 05):** the reel modules: Trailer, Explainer, Premise Reel, Motion, Ad Image, Campaign, Publish
  (dry run) and Approve, plus the script gate. "Make an ad campaign for Unity and Roblox players" ran live end to
  end on run `20261113-224654`: the Trailer (both cuts, on the author's track), the Explainer (narrated and
  rendered), the Premise Reel, both Ad Images and the Publish dry run. The premise reel has its picture, recorded
  in Roblox Studio, and "Re-render the Roblox premise reel at night, same narration" re-recorded it at night through
  the cell, with a day/night before/after. Details under "The reels" below.
- **Done (plan 06), Unity browser build waiting on WebGL:** Host, Verifier, Recorder, the deployed site and
  `pnpm stop`. The site is at https://infinite-harness.pages.dev: it replays a bundled take when no bridge
  answers, and talks to the bridge on 127.0.0.1 or through `pnpm bridge:public`'s tunnel. Deleting a file makes
  the Verifier fail that cell, fix it once and pass it. The Recorder made a 24 s video of run `20261113-224654`.
  Details under "Hosting, checking, recording (plan 06)" below.
- **Next:** plan 07, then plan 08 replaces fixtures with recorded takes and finalises the
  draft direction files (S37-S40, S42-S47).

## Waiting on the author

Agents write here what they stopped for (a program to open, a runtime to start, a sign-in, a question) and
remove the line when it is answered. See `AGENTS.md` rule 5.

- (plan 03) **WebGL Build Support** for the Unity 6 editor: the install was approved, but the Windows admin
  prompt was cancelled, so it is not installed (USER-TODO 1). Until then the Build cell makes a Windows player,
  and there is no "Play in browser". Checked again in plan 06: still not installed (the editor has only the
  Android and Windows players). Once it is installed, rerun the game prompt: Build switches to WebGL (gzip) by
  itself, and a Host cell puts it online. The hosting path itself is tested (`pnpm test:host`).
- (plan 06) **Two checks only you can make:**
  - open a Host cell's "Play in browser" link on your phone over mobile data (another network). This needs the
    WebGL build above; until then `pnpm test:host` shows the same path with a small test page;
  - open https://infinite-harness.pages.dev on another device: run `pnpm bridge:public` in a terminal and open the
    "pair the deployed site" link it prints there. The live graph should appear. I checked the tunnel, CORS
    and token from the shell, but I did not type the token into the public site myself.
- (plan 03) **Roblox side of crossplay:** the Host cell now puts the relay on a public address and writes it into
  the place's `Flags.luau` (and the open Studio place, HTTP on). A Studio play test showed no script errors on
  run `20261113-224654`. The Roblox rider meeting a browser rider still waits for the WebGL build.
- (plan 03) **Publishing the Roblox place:** not done, and not to be done without your approval.
- (plan 04) **Video:** which image-to-video setup to use (USER-TODO 7). The forge's `launcher/h3` would work but
  downloads about 65 GB of weights, and `plan/LOCAL.md` names a different video model. Until you choose, Video
  cells use the mock asset.
- (plan 04) **One more short voice reading?** The recorded Voice fixture also says the lead-in ("Read this in my
  voice: ..."), because the planner passed the whole sentence. That is fixed (the planner now passes only the
  script, checked on the mock bridge), but a clean recording costs one more short script of credits.
- (plan 05) **An Approve button on the site** next to a waiting script: today the go is a typed follow-up.
  Do you want a button (plan 06 or later)?
- (plan 04) **The chosen song is 2.06 s long** (`video/makeasong.mp3`, 45 KB). Music cells hand it over as it
  is; the games loop it. Put a longer version in `assets/music/` if you have one (USER-TODO 17).

## Verified

- `node video/tools/resolve.mjs`: 48 shots, 75 bars, 140.6 s; fastest voice line 2.9 words per second.
- `node video/tools/preview.mjs` renders `video/renders/shots-preview.mp4` with `score.wav` (duration checked
  with ffprobe against `timeline.json`).
- `python video/tools/score.py`: every take measured at 128.0 BPM; each cue's span within 8 ms of the grid.
  The author listened to the preview and approved it. Since then S24b (the three reels side by side, bars
  38-40) was added and everything after it moved 3 bars; its reel sound waits for plan 05.

- Plan 01 (2026-11-12), all on this machine:
  - `pnpm typecheck` clean; `pnpm test`: protocol 13 tests, web 7 tests (time map, timebase, effects).
  - `pnpm test:determinism`: 96/96 seeks byte-identical (every shot at 37% and 81% of its length, each reached
    once in order and once after jumping elsewhere; three.js shots included).
  - `pnpm test:live`: 22 checks pass (click a cell opens focus; Escape and a click outside return; maker badges
    on Image, Voice, 3D Model and Video cells, none on agents and orchestrators; MADE WITH in the focus view).
  - `pnpm shots:sheet`: `video/renders/sheet_01.png` ... `sheet_06.png`; all 48 shots looked at and recognisable.
  - `pnpm film:rough`: `video/renders/rough.mp4`. ffprobe gives 140.625 s for the video, the audio and the
    file, equal to `total`; 4500 frames at 32 fps (15 frames per beat), so every cut is on a click; click track
    plus `score.wav`.
  - `pnpm lint:brand` clean.
  - Verify first: GSAP 3.15 is free to use (no paid licence needed), and a `gsap.timeline({ paused: true })`
    driven only by `.seek()` is deterministic. three.js is driven by explicit time: each scene renders once per
    React commit with its orbit angle computed from the evidence's age, never in its own animation loop.

- Plan 02 (2026-11-12), all on this machine:
  - `pnpm typecheck` clean; `pnpm test`: protocol 13, web 7, bridge 36, none skipped, with no key in the
    environment (read by path). Bridge tests: store (seq and t
    monotone, restart closes open cells, torn last line, reopen keeps seq), server (401 without the token,
    WebSocket events equal events.jsonl, replay from seq 0 and from seq 10, artifacts, dotfiles and traversal
    refused), router table (16 plans recorded through the proxy with the test model, plus Act 1 routed live),
    JSON answer parsing, allow (vocabulary, grants, adapter arguments).
  - No-network probe, both real workers (`primary` and `secondary`) with no network grant asked to fetch a local
    URL: the local server got zero requests and neither answer contained the secret word.
  - Real router model through the proxy: "say hello three ways" and Act 1 give valid plans (Act 1: game, two
    voice cells for trailer and campaign, trailer, campaign, host, verify, recorder). `/proxy/status` answers
    connected, so the settings sheet shows the subscription as connected.
  - `primary` worker end to end (run 20261112-233932, `stream-json` adapter, routed by the real router model in
    1.4 s): `report_step`, then `spawn_task` three times through the harness MCP server; each child wrote its
    file and attached it; all five cells done in 40 s.
  - Real worker run (`pnpm smoke`, "say hello three ways", run 20261112-231406): the router (worker fallback)
    planned one agent cell; the worker called `report_step` and `spawn_task` three times through the harness MCP
    server; the three child cells appeared with their evidence. That run is take `smoke`.
  - `pnpm test:bridge`: the site paired to a bridge in mock mode; the typed prompt starts a run; a reload mid-run
    brings every cell back from seq 0; at the end the cells and states on screen equal `reduce(events.jsonl)`;
    clicking a child opens its focus view; with the bridge closed, `/?director=1&take=smoke` replays all cells
    with no request to the bridge and no page errors.
  - An agent module with only `prompt.md` (a throwaway module in a temp folder, real `secondary` worker): the
    router picked it, and the cell's answer followed an instruction that was only in `prompt.md`.
  - `pnpm dev` brings up both: the bridge answers `/health` with the token, the site answers `/`.
  - `pnpm test:live` and `pnpm test:determinism` (96/96) still pass; `pnpm film:rough` writes 140.625 s with
    every cut on a beat; `pnpm lint:brand` clean (now scans `apps/bridge` too). The recorded take, the
    `hello` fixture and the router plans hold no vendor names or local paths (checked by grep; `video/takes/` is
    outside the lint's folders).

- Plan 03 (2026-11-13), all on this machine (Unity 6000.2.7f2 open; rojo 7.4.4 and selene 0.32.0 through
  aftman):
  - Best run **20261113-014545** (the full prompt "Make a crazy racing game where humanoids fight while racing,
    with loops, twists and hover sections, on Unity and Roblox", through the bridge, 78 s): Game cell; Design;
    3 art requests; Unity and Roblox orchestrators with six child cells each; every child has at least 2
    evidence items (Unity: editor shots plus the game.json section; Roblox: an SVG drawn from the place's data
    plus the Luau it wrote); 10.0 s `gameplay.mp4` (ffprobe); the Unity race test finished in 124.4 s with 21
    hits and a finish order; Windows player built in 5 s (95 MB); Roblox `place.rbxlx` built (58 KB), selene 0
    errors and 0 warnings.
  - Follow-ups on that run (wall time per `pnpm smoke` call, including the router): night 3.6 s, realistic
    3.9 s, music 2.9 s, crossplay 4.0 s. Each also rebuilt the Roblox place ("Rebuilt the Roblox place",
    0.2 s). The shots were looked at: night lamps and glowing kart edges; realistic before and after; the
    crossplay capture shows the stand-in "Roblox rider" ghost with its name tag.
  - Relay: the crossplay cell sends a WebSocket state and an HTTP state into a side room, and each arrives on the
    other side.
  - Fixtures recorded from that run: `game`, `game.unity`, `game.roblox`, `game.design`, the six Roblox parts and
    the four follow-ups. The six Unity parts have none; the `game.unity` fixture replays them.
  - `pnpm typecheck` clean; `pnpm test` (protocol, web, bridge 36 including the router table) passes;
    `pnpm test:bridge`, `pnpm test:live`, `pnpm test:determinism` (96/96) pass; `pnpm film:rough` 140.625 s;
    `pnpm lint:brand` clean (523 files). Fixtures were checked for local paths and keys by grep.

## Hosting, checking, recording (plan 06)

- **Tunnels:** Cloudflare quick tunnels (no account, a random `*.trycloudflare.com` name each time), from the
  portable `cloudflared` in `runs/.tools/` (`paths.cloudflared`). `apps/bridge/src/tunnels.ts` opens one per
  target and shares it between owners (a run, or `bridge:public`). It closes when its last owner ends, when the
  bridge stops, or on `pnpm stop`. Every pid the harness starts (tunnels, the Unity editor it opens) is in
  `runs/.procs.json`; `pnpm stop` kills only those, never by program name, because the author runs
  cloudflared for other things. A new name takes 10-60 s to resolve, and the local DNS can cache it as missing,
  so "answers from outside" is checked over DNS-over-HTTPS with the connection pinned to that address.
- **Host** (`modules/host`): the build at `/runs/<id>/<path>/` (no token, gzip/br with `Content-Encoding`). A
  tunnel, then a wait for a 200 from outside, then a headless screenshot through the public address. The relay
  goes to `<address>/relay/<run>` and into the Roblox place's Flags. For Roblox it writes a "ready to publish"
  note and records a Studio play test; it never publishes. Run 20261113-224654 had no browser build, so its Host
  cell put the relay online (Studio play test: no script errors). `pnpm test:host` (a throwaway run with a
  canvas page) found and fixed a wrong build path in Host and in the Verifier.
- **Site:** https://infinite-harness.pages.dev, the classic Pages project `infinite-harness` (production branch
  `main`). Deploy with `pnpm --filter web build` then, from `apps/web`,
  `npx wrangler@4 pages deploy dist --project-name infinite-harness --branch main`. The build carries one take
  (fixture `main` and its art, plus `video/timeline.json`) and nothing from `runs/`. It was checked for the
  token, local paths and the brand list. With no bridge answering, the site replays that take under a
  "Connect a bridge" note. With a bridge answering, it is the prompt box and runs as before. For another
  device: `pnpm bridge:public`, then `?pair=<token>&bridge=<tunnel>` (printed on the terminal only).
  `bridge.origins` lists the site, so the bridge answers its CORS and private-network preflights. A newer
  wrangler tries to turn a Pages project into a Workers one; the project was created with `--force` once, and
  later deploys go straight to Pages.
- **Verifier** (`modules/verify`): waits for the other cells, then checks every file they made (see its
  README), marks each cell, sends one fix with `ctx.ask`, re-checks, and fails honestly.
  - **Shallow checks:**
    - the Roblox play test runs only when the harness place is open in Studio;
    - the browser build is checked only when there is one;
    - link pages pass on a non-blank picture within about 60 s;
    - documents are checked for presence only.
  - The verify test runs with mock off, because in mock mode the Verifier replays its fixture.
- **Recorder** (`modules/recorder`): the stage's automatic cut (`apps/web/src/autocut.ts`, `?director=1&run=<id>`)
  captured by `video/tools/capture.mjs` through `video/tools/record-run.mjs`, with the song. Capture runs at
  **12 fps at 1920x1080**: a 24 s video takes 32-46 s on this machine. Run 20261113-224654 (91 cells, 61
  outputs) gave 24.0 s, 288 frames, with sound (`artifacts/recorder-2/process.mp4`). The first cut,
  `artifacts/recorder/`, came before the camera fixes.
- **Fixtures:** `host` (relay + Roblox, from 20261113-224654), `verify` (one fix, from 20261114-122537),
  `recorder` (the 24 s video, re-encoded small).

## The reels (plan 05)

- **Modules:**
  - `reel.trailer`: the studio's trailer recipe on the run's own game. It records 3 HUD-free 24 s clips at
    1920x1080 through `play_capture` with `director: true`: a capture-only camera operator (`Director.cs`) cuts
    every 3 to 4 s between 9 angles (front, chase, bumper, top, side, quarter, low kerb, high, orbit; the angle
    used longest ago) onto the fight most likely to happen next, by the riders' own attack rules, and holds the
    shot until the attack lands. `events.json` logs each cut, hit and attack and whether it was on screen;
    `edit.ts` keeps each shot inside one angle and places it on the fights (a hit counts more than an attack).
    The footage is recorded again when its key (capture settings plus the game's scripts) changes. `beats.py`
    finds the beat grid, then `head.py` plus the studio's `render_tail.py` render a 9:16 cut and a 16:9 cut.
  - Trailer re-cuts (2026-11-14, author's notes: camera shake, more fighting, not only behind shots, karts
    shaking left and right): every camera is held in track space (the game's chase camera too; its jitter went
    from 2.67 to 0.23 px a frame). The karts' heading and lean are eased (about 0.2 s) and the AI eases into a
    new line, so a bump or a pass no longer snaps them sideways (heading jerk 3.08 to 0.16 degrees a frame in a
    test capture). Hit effects got streaks, a flash and a ring; pink and violet effect colours are moved off
    pink. Last cut (`trailer-3`): 15 hits and 17 attacks on screen across 3 clips, contact sheet looked at, sent
    to the author.
  - `reel.explainer`: explains the run's Unity game to players (premise, track, fight, classes, how to win,
    where to play) from facts read from its design (`gameFacts`); never how it was made (author, 2026-11-14).
    Script, gate, the `explainer` voice, a HyperFrames picture in the game's colours, then the studio's sound,
    captions and assembly. About 24 s. The Campaign hands it the Unity brief.
  - `reel.premise`: a Template A script that opens with "In this world,", the gate, the `premise` voice
    (fx A, 1.15x), then the picture once the studio project has `gen_shots.py` and `project.json` (authored in
    the recording place after the author's green flag; without them the cell stops after the narration, as
    before). Lighting comes from the `lighting` param, else "night" in the prompt, else day. The cell generates
    `Shots.lua` for the lighting, records a take in Studio with `capture.py` (sync, Play, the studio recorder on
    the portrait monitor, stop on "[cutscene] done", cut the set-change holds, measure the white slates), or
    reuses the last take when its key (the hash of `Shots.lua` and the project's `build_cast.lua`, which
    `capture.py` runs before recording) is the same (`retake: true` forces a new one). It then
    assembles with the cached narration, captions, sounds and bed, and adds a wipe before/after against the other
    lighting when that reel exists. About 25.6 s.
  - `motion`: HyperFrames clips.
  - `ad.image`: an image-model picture, with the type set in code.
  - `campaign`: one brief per audience, then the pieces side by side, then a Publish dry run.
  - `publish`: a dry run only, with sockets and writers blocked.
  - `approve`: a hash-bound go.
- **Lengths** (the author: "full length, a bit shorter"): premise about 30 s (its recipe runs 35-45 s),
  explainer about 24 s (its recipe runs about 30 s), trailer 30 s.
- **Proven:**
  - The trailer planner and engine, on a stand-in track in the scratchpad: 900 frames, 30.0 s, -13.9 LUFS,
    fast render 73 s.
  - Motion "title card that says READY": run `20261114-004831`, 3.0 s, render 21 s, fixture re-recorded.
  - Publish dry run, against the real studio (test).
  - Router re-recorded: Act 1 routes to Game, Trailer, Campaign, Host, Recorder and Verify. "go" routes to
    Approve.
- **Campaign live** (run `20261113-224654`): briefs "ZAP PAST THE PACK" (Unity) and "SEND THE PACK
  SPINNING" (Roblox). Explainer, Premise Reel, two Ad Images and the Trailer run side by side as the Campaign
  subtree. Fourth pass (`campaign-4`, on voice account 1; the trailer and ad notes below are from the third pass,
  `campaign-4` made the same again with new ad lines "ZAPWICK RUSH: MASTER THE CHAOS" and "ZAPWICK RUSH:
  SCRAMBLE THE PACK"):
  - Trailer: `artifacts/campaign-3.trailer/trailer-9x16.mp4` and `trailer-16x9.mp4`, 30 s each, 25 cuts on the
    beat, the drop at 12.8 s, -14.0 LUFS, no HUD. The captions are about the game only: "8 RIDERS", "FIGHT FOR
    THE LEAD", the loops and twists, then "ZAPWICK RUSH / PLAY NOW ON PC".
  - Ad Images: Unity "MASTER THE LOOP. STEAL FIRST." / "Race Now", Roblox "EIGHT RIDERS. TOTAL CHAOS." /
    "Play On Roblox", feed and story each. The picture brief now describes the game (kart, rider, track,
    colours), so the ads show karts on the track (looked at).
  - Explainer: `artifacts/campaign-4.explainer/explainer.mp4`, "What If Your Kart Race Had Punching?", 59
    words, 1080x1920, 20.1 s (19.3 s of narration). About the game only: the loops, the 24 m drop, the punch,
    the four classes, the trophy, "Play it on PC" (frames looked at).
  - Premise: 110 words read in 24.9 s (fx A, 1.15x), opening "In this world,". Picture (after the green flag
    and the author copying the race into "Global Set - Inf"): the race set at +47500 Z, a cast of karts and
    riders (`build_cast.lua`), 34 shots, recorded in Studio and assembled at -14.7 LUFS, 25.6 s, 9:16. Day by
    hand first, then night (lifted ambient, exposure 0.75). Then the follow-up "Re-render the Roblox premise reel
    at night, same narration" (`premise-night`) ran the cell end to end: it recorded a new night take in Studio
    by itself (1533 frames, 0 set holds), assembled it, and attached the day/night wipe at 13.6 s. Contact sheets
    looked at for both: no pink, no black or white frames, no freezes, captions in sync. Same narration files
    (hash checked), no new voice credits. Recast on the author's ask (2026-11-14): Ben's hair turned 90 degrees
    clockwise (the turn the source rig had and the cast copy lost) and the thrower is now Jade (curly hair,
    argyle vest; the author picked her from a line-up). The take key then took in `build_cast.lua`, so the cast
    change made the cell record anew: `premise-day` and `premise-night-2` each recorded a take in Studio and
    assembled (sheets looked at; magenta-rule hits only on Ben's open mouth and the flashback's dark scanlines,
    nothing pink to the eye). `premise-night-3` ("at night again") then reused the night take live ("Take
    reused", no Studio, 30 s). Studio-side notes: the project's `STATE.md` in the studio.
  - Both scripts passed the gate as "Script approved earlier" (the go's from 2026-11-14, kept in the ledger).
  - Publish dry run: 3 posts planned for the explainer (TikTok dev_en, Instagram dev_en, YouTube explainers),
    nothing posted. No studio account posts trailers; the premise reel was not routed in that dry run (it had
    no picture yet), and nothing has been published.
  - `video/audio/reels/trailer.wav`, `explainer.wav` and `premise.wav` (the night reel) copied from the mp4s
    (sound from the first frame).
- **HUD switch verified in the open editor:** the template is synced and compiles with 0 errors. `play_capture`
  with `hud: false` has no HUD, and the HUD is back on the next capture. The trailer cell now syncs the
  template and runs `setup` (which compiles) before it records.
- **Gate carry-over:** a go is tied to the script file. If the bridge stops while a cell waits, asking for the
  reel again reuses the script, and an earlier go still counts (tested). Each go a cell takes is also written to
  `runs/<run>/approvals/approved.json` (script path and hash), so the approval survives a later step failing
  (the voice): a re-ask on the same text passes the gate without a new go, and an edited text waits (tested).
- **Song prompt for the trailer track** (instrumental):
  > Instrumental high-energy electronic kart-racing anthem, 140 BPM, punchy four-on-the-floor kick, distorted
  > synth bass, bright arcade lead, revving-engine risers. Short intro, an 8-bar build with a snare roll and a
  > rising sweep, one beat of silence, then a huge drop with sidechained bass and stabbing synth chords. Video
  > game trailer energy, no vocals.
- **Credits used in plan 05:** voice account 1 (the original paid account): 225 credits for both reads, 9,758
  left. Image calls: 12 ad pictures (two ads with two sizes each, on the second, third and fourth passes).
- **Voice account:** `voice.account` in `harness.local.json` = { use, as } names which key line of the studio's
  `.env` pays (account 1, per the author on 2026-11-14) and the name the narration tool reads it under. The key
  is handed to the tool as that variable only, never logged; the studio's `.env` is unchanged (tested).
- **Fixtures:** recorded from run `20261113-224654` for `reel.trailer`, `reel.explainer`, `reel.premise`,
  `ad.image`, `approve` and `campaign` (the campaign fixture carries its whole subtree). Media shrunk for the
  repo (videos 360 px, narration 16 kHz mono, ad pictures at half size); local paths replaced by `<studio>`.
  `reel.trailer` re-recorded from `trailer-3` (the director cut). `reel.premise` re-recorded from `premise-night-2` (the recast night reel, its stills and the before/after). The fixture
  recorder now gives run files that share a base name (`stills/still-01.jpg`, `day/still-01.jpg`) their own
  fixture files; before, the before/after pointed both sides at one picture (tested).
  `HARNESS_MOCK=1` replays the whole campaign from them (16 s at speed 20). Worker steps for the CLI's own
  tool listing are titled "Looked up its tools" (they carried the CLI's name; caught by lint:brand).

## The assets (plan 04)

- **Modules:** `assets.image` and `assets.image.edit` (the image model behind the local proxy; the model id is
  only in `harness.local.json`), `assets.cutout` (background removal on the asset forge), `music` (the chosen
  song), `voice` (the studio's narration tool with the cloned voice). `assets.model3d` is from plan 03.
  Shared helper `modules/_shared/image.ts`; each module has a README with the exact calls and a fixture recorded
  from a real run.
- **Image chain memory:** Image Edit and Cutout take the first image in `refs`, else the last picture an image
  cell put out in the same run (read from `events.jsonl`). Live run `20261113-222539`: "show me a house" (Image,
  2 candidates, 1408 x 768, 8 s), "make the walls red" (Image Edit under it, same framing, 9 s), "transparent
  background" (Cutout under that: RGBA PNG, 66 % transparent, the red house intact). The site draws cutouts on a
  checkerboard (`meta.checker`) with a before/after wipe.
- **The image model has no real transparency** (asked for it, it paints a checkerboard). So Cutout has no
  fallback, and `assets.image` with `transparent` asks for a plain white background and hands the picture to a
  Cutout cell (not run live yet).
- **Timings:** Image 8 s (two candidates in parallel), Image Edit 9 s, Cutout 629 s on a cold forge (about
  8 minutes of runtime setup, then 138 s for the cutout itself, which includes loading the model), Music 1 s,
  Voice 1.3 s for 13 words. Results are cached (cutout by picture bytes, voice by script, 3D models by prompt),
  so a repeat costs nothing.
- **Live backends:** the proxy's image model, the Colab forge (one L4 runtime, shared by Cutout and 3D Model),
  the voice service through the studio's tool. **Credits used:** one short voice script (13 words, 5.7 s).
- **On mock:** Video (no `assets.video` module yet; the runner's mock asset answers video requests).
- **Forge setup steps** in a cell now show neutral stages ("installing, part 2 of 4"); the launcher's own
  lines named packages and weights. The forge stops 90 s after its last user, but only if this bridge started
  it, and a bridge restart drops the timer: after testing, check it with `colab status -s forge` in WSL.
- **Maker badges:** every asset cell carries its `maker` (nano-banana, birefnet, hunyuan3d, suno, elevenlabs).
  No icon files yet (USER-TODO 19), so the graph shows the neutral glyph on each.
- **Mock replay:** on a `HARNESS_MOCK=1` bridge the house chain, the song and the voice prompt replay from the
  new fixtures and deliver their files.
- **Game run with real assets** `20261113-224654` ("Zapwick Rush", about 41 min): the game cells asked the asset
  cells for music, two banners and eight models. Music handed over the song; the "Hover Arrows" banner was
  drawn (7 s) and imported into Unity as `Banners/hover-arrows`; the eight models took about 3 min each, one
  after another on the forge GPU. Unity built for Windows (15 s) and the race test passed (137 s, 48 hits). A
  new Unity shot view `board` (in front of the first track-side board) shows the generated banner on the board
  in the running game. The Roblox place was built, not opened. Result: 10 assets delivered, 1 failed (the second
  banner, 429).
- **Image quota:** that 429 was the image model's quota running out, not parallel calls. The proxy answers with
  `retry-after` of hours, and the quota resets on its own (on 2026-11-13 it was used up at about 23:30, free
  again about 3.5 h later). `imageCall` now retries short waits (5 to 45 s, up to 6 tries) and fails at once
  with "the image model's quota is used up; it is free again in about ..." when the wait is longer than 2 min
  (checked live on run `20261113-234452`). Three pictures at once could not be re-tested while the quota is out.
- **Pictures in Roblox (approved 2026-11-13):** the Roblox place now has six track-side boards like the Unity
  game (`Config.banners`, image ids; plain faces without). The "Hover Arrows" banner of run `20261113-224654` is
  uploaded to the game account as a Decal (passed moderation), cropped to the banner panel because the
  picture's background had real sponsor logos; its image id is in `runs/.cache/roblox-assets.json`. The rebuilt
  place, with the scripts copied into the game account's place through the MCP plugin (not saved or published),
  showed the banner on 4 boards in play (`artifacts/game.roblox.build/studio-board.jpg`). That run's eight new
  3D models are not uploaded (not part of this approval), so its karts were part-built.

## The games (plan 03)

Modules: `game` (orchestrator), `game.design` (worker), `game.unity` and `game.roblox` (engine orchestrators),
`game.unity.{track,karts,humanoids,combat,ui,build}` and `game.roblox.{...}` (hidden parts), and the follow-ups
`game.lighting` (night), `game.shaders` (realistic), `game.music` (music) and `game.relay` (crossplay). Every
module folder has a README. The shared run state is `runs/<id>/game-state.json` (design, art, Unity project and
build, Roblox place, flags).

- Projects: the Unity project lives in `paths.unityProject` (default `runs/.game/unity`; the template is laid over
  the URP template), and the Roblox project in `paths.robloxProject` (default `runs/.game/roblox`, a Rojo project
  with `default.project.json`, `aftman.toml` and `selene.toml`). Each run rewrites the config files in them.
- Unity driver: a file queue (`Harness/queue`, `Harness/done`) that the open editor polls
  (`Assets/Harness/Editor/HarnessBridge.cs`). Play ops write their result before they leave play mode, because
  leaving play mode can reload the scripts and drop the op.
- Roblox track: the Roblox Track part asks the Unity editor for the same centre line (`track_export`, every 3rd
  sample, frames and hover spans), so both engines race the same loops and twists.
- Relay: `ws://<bridge>/relay/<room>` for the Unity build; `POST /relay/<room>` with `{state}` or `{states}`
  (answers the other clients' states) and `GET ?since=N` (long poll) for Roblox. A state goes stale after 5 s.

**Hand-off.**

- Best run: `20261113-014545`. Timings: design about 39 s (worker); Roblox side about 3 s; Unity parts 1-2 s
  each on a warm editor; Build = race test about 10 s, then the 10 s capture (about 15 s), then the Windows build
  (144 s cold, 31 s after a script change, 5 s incremental).
- Improvised vs scripted: the design (title, track shape, loops, twists, hover, kart names, weapon, combat
  numbers, HUD) is improvised by a worker in `game.design`. Everything after it is scripted: the parts turn the
  design into config, and the editor and Rojo do the work. Art comes from the asset kinds (test placeholders until
  plan 04).
- Rough edges:
  - No WebGL build yet (Windows fallback; see "Waiting on the author").
  - The Roblox place has been played in Studio once, by hand (see the 3D models block below). Roblox music
    needs an uploaded audio id (`Flags.musicId`), so the music follow-up plays only in Unity.
  - The Roblox track depends on the open Unity editor (it exports the centre line from there).
  - Keep the Unity editor in front: in the background, play mode can run many times slower (one race test took
    over 8 minutes and timed out).
  - The first render after a rebuild can come out blank (the shots op throws one away); URP can show a one-time
    dialog in a new project; the crossplay ghost's body is faint, so its name tag carries it.
  - Music in the full run is the test placeholder loop.

**3D models, rider classes and scenery (2026-11-13).**

- Generated models from the forge (`assets.model3d`): the kart body, the four rider classes, landmarks and the
  trophy. A batch of 8 takes about 45 minutes, because the textures run one at a time. A cell gives up only after
  30 minutes with no change in its forge job (or 4 hours in all), and it reopens a dropped port forward instead of
  failing. The root summary counts failed assets apart from failed tasks.
- Unity: the models face +Z after the OBJ import (yaw 0). The rider sits in the kart's seat, found from the
  kart's vertices (`Models.Seat`; `Editor/ModelImport.cs` keeps them readable). The track is lifted wherever a
  road edge, a banked side or a twist would dip into the grass, and `Scenery.cs` adds mountains, rocks, bushes,
  flowers, flags, a grandstand, balloons, floating islands, clouds, a blimp and arches. Checked in the editor
  shots after the fix: the karts and riders face forward, the riders sit in the karts, and no road dips into the
  grass at the corners or twists.
- Roblox: the same seat (worked out from the OBJ by `lib/seat.ts`) and the same scenery (`Scenery.luau`, motion
  on the client). Linted with selene and built with rojo. The 8 models of run `20261113-205415` are uploaded
  (2026-11-13) to the game's own Roblox account as Model assets (all passed moderation; ids in
  `runs/.cache/roblox-assets.json`), and the rebuilt place has their ids. `luau()` now writes whole numbers as
  they are (a 15-digit id came out with a stray fraction).
- Played in Studio (2026-11-13), in the game account's own place, with the scripts copied in through the MCP
  plugin (not saved or published): all 19 model copies loaded (8 karts, 8 riders in four classes, 2 landmarks,
  the trophy); the kart faces forward with the rider in its seat, the trophy stands on its podium, the AI karts
  race and attack. Studio logs "No asset content representation found" for some content ids of the uploaded
  meshes; the meshes and their colours still show. Lighting.Technology cannot be set from the plugin, so that
  copy ran with the place's own lighting technology. Shot: `artifacts/game.roblox.build/studio-play.jpg`.
- Four rider classes in both games: volt (electric dash), sniper (mouse crosshair, one shot every 10 s), shrink
  (small and fast, slowed hard when touched) and thrower (an item forward every 3 s).
- **Rider pick (2026-11-13):** the player now chooses the class. Unity (`ClassSelect.cs`): four cards before the
  countdown (1-4, Left/Right and Enter, or a click); the race is rebuilt with that rider, and C on the finish
  screen picks again. On autopilot the pick is skipped; the bridge's play ops take `rider` to pick through the same
  code (race test with `rider: "volt"` finished in 137 s, player on volt). Roblox: the same cards on joining (and
  C between races); the server swaps the kart's rider in place (`PickClass` remote), and the countdown waits up to
  30 s for players still choosing. Played in Studio: a click on Shrink and the key 1 (Volt) each swapped the
  generated rider and the HUD class, no errors.
- Full run `20261113-205415` ("Zigvolt Rush", the crazy racing prompt on Unity and Roblox) finished with no
  errors in 42 minutes: all 8 models arrived (the last after 40 minutes, so past the old 30-minute cut-off), and
  "11 assets delivered". The port forward dropped twice during the run and was reopened each time. Unity: built
  for Windows, and the race test finished in 137 s with 33 hits, every class firing; in the capture and finish
  frames the generated kart faces forward with the rider in its seat, and the scenery is in place. Roblox:
  place built, lint clean (105 KB).

## The bridge (plan 02)

Run it: `pnpm dev` starts the bridge (`127.0.0.1:7411`) and the site (`127.0.0.1:5173`). Pair the browser once:
`pnpm pair` prints a link, or paste `runs/.bridge-token` into the settings sheet (gear on the prompt screen).
Endpoints, config keys and scripts: `apps/bridge/README.md`. The `allow` vocabulary, the fixture format and the
harness MCP launch are in `plan/00-contract.md`.

| URL | What |
|---|---|
| `/` | Prompt screen ("Ask for anything", mic, send). Sending starts a run and moves to `/?run=<id>`. |
| `/?run=<id>` | The run's graph, live from the WebSocket (from seq 0, so a reload rebuilds it). Click a cell for focus; the bar at the bottom sends a follow-up (`/say`) to the same graph. |
| `/?take=<take>` | A take on the wall clock, no bridge. |
| `/?director=1&take=<take>` | A whole take in director mode (seek only), no shot or timeline needed. |

Mock mode: `HARNESS_MOCK=1 pnpm dev` replays recorded router plans and module fixtures; nothing is called.
Modules so far: `mock.echo`, `mock.agent` (fixture `hello`, recorded from a real run), `mock.asset`.

**Hand-off.**

- Worker command lines, by config key (the real paths, versions and full flags are in `plan/LOCAL.md`):
  - `workers.secondary`, adapter `exec-jsonl`: `<cli> exec <config args> --json --skip-git-repo-check
    --ephemeral --ignore-user-config -s workspace-write -C <cell folder> --add-dir <write grants>
    [--output-schema <file>] <tool and network switches from allow> <harness MCP server as -c overrides> -`
    (prompt on stdin). This machine needs one config arg for its sandbox mode (in LOCAL.md), or every write fails.
  - `workers.primary`, adapter `stream-json`: `<cli> -p --output-format stream-json --verbose
    --no-session-persistence --strict-mcp-config --mcp-config <cell>/.mcp-servers.json --restricted --tools
    <granted built-ins> --allowedTools <granted tools> --permission-mode acceptEdits --add-dir <write grants>
    [--model <id>] [--json-schema <schema>]` (prompt on stdin). Verified end to end (see "Verified").
- Router model id keys: `proxy.routerModel` for real runs, `proxy.testModel` for the tests and
  `record:router` (the real model ids are in `plan/LOCAL.md`). Fallback worker: `router.worker` (currently
  `secondary`). Recorded plans say which backend and key produced them. The proxy key is read by path
  (`proxy.keyFile`) when `HARNESS_PROXY_KEY` is not set, so `pnpm dev` needs no exported variable.
- Router latency, proxy route: real model 1.4-2.9 s for short prompts, 9.3 s for Act 1 (it refuses the proxy's
  JSON mode, so each call is a 400 then a retry with the schema in the instructions; the 400 is under 1 s).
  Test model 2.4-11 s per prompt, 16-20 s for Act 1. Worker fallback: 4.8-8.3 s, Act 1 15.8 s.
- What the adapters cannot observe or enforce:
  - Reads. `allow` has no read list; a worker can read any file the user can.
  - Hosts. `network` names other than `*` are not enforced per host; only "no shell and no web" (no way to reach
    a host) or `*`. On this machine the sandbox does not cut the network for shell commands, which is why
    `shell` requires `network: ["*"]`.
  - What an MCP server from the CLI's own config does on its side (only the call and its result are seen).
  - Built-in tool calls appear as steps only as far as each CLI's event stream reports them.

## The stage (plan 01)

Run it: `pnpm install`, then `pnpm dev` and open `http://127.0.0.1:5173/?fixture=main&start=40000` (`/` is now
the bridge's prompt screen, see above).

| URL | What |
|---|---|
| `/?fixture=main&start=40000` | Live mode: the fixture plays on the wall clock from `start` ms. Click a cell for its focus view; Escape or a click outside the panel returns. |
| `/?director=1&shot=S11` | One shot. Time moves only through `window.__harness.seek(ms)`. |
| `/?director=1&from=S09&to=S20` | A range, on the film's timeline. Add `&t=<ms>` to open at a time, `&play=1` to play it on the wall clock. |

`window.__harness = { mode, ready, duration, shots: [{ id, at, durMs, view }], seek(ms): Promise, view?() }`.
`seek` resolves after React has committed, fonts are loaded, every image on the stage is decoded and two
frames have been drawn. `view()` (live only) returns `{ view, focus }`.

Tools. Each starts the dev server itself on port 5199 (or uses `HARNESS_WEB_URL`); the tests use 5198.

| Command | Writes |
|---|---|
| `pnpm shots:direct [S28 S29] [--force]` | Draft `video/direction/<shot>.json`; keeps files with `"draft": false` unless `--force`. |
| `pnpm shots:sheet [--from S09 --to S20]` | `video/renders/sheet_01.png` ... (8 shots each, at 25/50/75%); a partial range writes `sheet_S09-S20_01.png`. |
| `node video/tools/capture.mjs --shot S11 [--fps 60] [--scale 1]` | `video/renders/S11.mp4` (or `--from`/`--to`, `--out`). |
| `pnpm film:rough [--fps 32] [--scale 0.5]` | `video/renders/rough.mp4`, `total` long, click track plus the music in `timeline.grid.music`. 32 fps puts 15 frames on a beat. |
| `pnpm test:determinism`, `pnpm test:live` | Checks only. |

The browser flags in `video/tools/stage.mjs` (`CHROMIUM_ARGS`) are part of determinism: GPU raster and partial
tile re-raster each left 1-level differences on text that depended on the previous frame. Any new capture tool
should use `launch()` from there.

**Rendering rule as built.** UI = f(events, t, view). `global.css` turns CSS transitions and animations off.
Every motion is a function of shot-local time or of an event's age; the camera is a paused GSAP timeline that is
only seeked.

### What each view can and cannot do

| View | Can | Cannot yet |
|---|---|---|
| `prompt` | Text box with word-by-word typing over `typeBeats` (words spread evenly), `prior` text, caret on 8th notes; chips that appear on beats, replace each other, blink a dot or show a globe; `ring` (chips form the ring), `glitch`, `slam`, `push`, `appear`, `enter` (punch). | Typing is not driven by voice word timings; plan 05/08 can set `typeBeats` per line or add a `words` param. |
| `graph` | Polar tidy tree around the root with a seeded offset; sub-orchestrators laid out the same way; cells with icon, label, state ring, maker badge, live evidence thumbnail, child count; new cells ease out of their parent; curved edges; request/deliver lights travel along a bright edge; `intro: "collapse"`, `verify` (check marks cascade), REC dot in director mode. | In director mode the camera fits the take's final graph, so the first cells look small (S09, S10). Long request edges can leave the frame (S13). |
| `focus` | Camera tween into a cell, breadcrumb header, step ticker, evidence stage (`revealMs`; `kind` picks one evidence kind), facts column (elapsed, files, tools as icons, MADE WITH maker icon). | No scrolling for long tickers; facts are only what the events carry. |
| `split` | One or two windows (`left`/`right`: node, kind, label, evidence index), `lit` cells in a mini-graph, `cuts`, a `link` line between windows, `rise`, `full` (full bleed), `mini`. | Vertical sources are cropped to the window (S16 reels). |
| `wall` | `grid` or `reels` layout of evidence, `stagger` in beats, `fadeBeats`, `push`, `drift`. | The first tile in S25 (the link) shows a dark page until its URL has typed in. |
| `banner` | Module title with icon and maker mark, the prompt typing under it, breadcrumbs, the cell's evidence full width, `graphBehind` (dimmed graph through a cutout). | One cell per banner. |
| `rain` | Every take merged into one graph, prompts swiping through the box at `rate` per beat (`offset` into the list), a title line, zoom out. | Prompts come from `rain` in `video/timeline.json` (the resolver's list); there is no per-shot list. |
| `title` | `fake` (small wordmark, dims), `implode` (cells converge on the wordmark in the first half beat), `end` (wordmark, `sub` line, fade to black). | `implode` draws 64 abstract dots, not the film's real cells, so S46 does not yet show "every cell implodes". |

Evidence kinds: image (resolves from blur, cross-fade from `prev`, noise), frames and video (`FrameClip`, frame
index from age), model3d (procedural kart, house, robot, board; parts arrive per `partBeats`; orbit from age),
audio (waveform with playhead), chart (history, forecast band, anomaly markers), doc (page fan, line drawing, grid
of guides), code (diff with glint), link (browser frame with typed URL). Real glTF files are not loaded yet; the
loader that plan 04/08 adds must keep the "render per commit" rule.

### Direction files

`video/direction/<shot>.json`, typed in `apps/web/src/direction.ts`. Positions are beats from the shot's first
beat; the take is addressed in its own ms.

| Field | Meaning |
|---|---|
| `shot`, `view` | Shot id and one of the eight views. |
| `draft` | `true` if written by `direct.mjs`; set `false` once hand-tuned. |
| `take`, `mergeTakes` | `video/takes/<take>/events.jsonl`, falling back to `apps/web/fixtures/<take>.jsonl`. |
| `events.at` | Piecewise-linear map `[[beat, takeMs], ...]`. Past either end it extends the end segment's slope; a flat map (`[[0, 40000], [1, 40000]]`) holds the take still. |
| `camera` | Keys `{ beat, target: "all" or a node id or a list of ids, zoom?, dur? (beats, 0 = cut), ease?, dx?, dy? }`. |
| `focus` | The node the view centres on. |
| `fx` | `{ type: "flash" / "shake" / "punch" / "fade" / "blur", beat, dur?, ... }`. |
| `params` | View settings (see the table above). |
| `note` | Free text. |

Example, `video/direction/S11.json` (Unity > Karts: the take runs at twice speed while the camera dives in):

```json
{
  "draft": false, "shot": "S11", "view": "focus", "take": "main", "focus": "u.karts",
  "events": { "at": [[0, 8000], [4, 11750]] },
  "camera": [
    { "beat": 0, "target": ["unity", "u.karts"], "zoom": 1, "dur": 0 },
    { "beat": 0, "target": "u.karts", "zoom": 2.4, "dur": 1, "ease": "power3.in" }
  ],
  "params": { "revealMs": 300 }
}
```

Hand-tuned: S01-S36 and S41. Drafts: S37-S40 and S42-S47. They render and read correctly; plan 08 tunes them.
Sheet note: the 50% and 75% samples of S35 land exactly on the guide events (beats 8 and 12), so the sheet
shows the first tile of a wall that fills in over the next 200 ms. That is expected, not a bug.

### Fixtures

`apps/web/fixtures/main.jsonl` (190 events, the Act 2 tree) and one small file per Act 3 and Act 5 take (night,
crossplay, realistic, music, house.*, study, cad, cad.sim, pcb, forecast, anomaly, car.house, house.game).
Placeholder art is SVG in `apps/web/fixtures/art/`. Maker ids appear only as `maker` values on `node.spawn`
lines. Icons belong in `apps/web/public/makers/<id>.svg`. None are there yet, so the neutral glyph is drawn.
The tools report "page errors": all of them are 404s for `video/takes/<take>/events.jsonl`, which the stage tries
before falling back to the fixture (checked: the full film has 20, one per take, and nothing else fails; all 48
`?director=1&shot=<id>` URLs reach ready with no script errors). They disappear once plan 08 records the takes.

## Decisions by the author (2026-11-11)

- Deadline: 3 days. Most module internals already exist in other projects; expect wrap-and-wire work.
- Film: record real runs, replay on the beat clock; edit with HyperFrames.
- Agents: headless CLI workers.
- Unity: Unity 6 + WebGL module.
- (2026-11-12) The two generated full-length tracks are dropped: their arc did not match the shots. The music
  is now scored to the film in short cues (see "Music cues" in `video/SHOTS.md`). The opening prompt is read in
  18-20 s. The film has no minimum length.
- (2026-11-12) Every commit ends with the co-author trailer in `plan/LOCAL.md` ("Commit trailer"), whichever
  tool or model made it. `AGENTS.md` at the repo root says so to every agent.
- (2026-11-12) Cells of non-LLM generators show their maker's icon in the graph (contract, "Maker icons").
  LLM vendors stay unnamed and unshown.

## ASSUMED (see the list at the end of 00-contract.md)

- ASSUMED: the maker mark is an icon only (no name in text), on every non-LLM generator cell including Image
  and Forecast, whose makers also make LLMs. Non-AI tools (render, host, recorder) get none.
- ASSUMED: icon files are not fetched by agents; the author supplies or approves them (USER-TODO 19).
- ASSUMED (plan 01): the prompt said "plan/0N-<name>.md" with N unfilled; plan 01 was taken as the next plan.
- ASSUMED (plan 01): fixtures were produced by a one-off generator script; only its output (`apps/web/fixtures/`)
  is committed. They stand in for the hand-written fixtures the plan allows; plan 08 replaces them.
- ASSUMED (plan 01): `video/tools/score.py` used a word on the brand deny-list as a variable name; it was
  renamed (`strength`) so `pnpm lint:brand` is clean. Behaviour is unchanged.
- ASSUMED (plan 02): in Act 1, "Game (Unity+Roblox)" is one game cell whose prompt names both engines (the game
  module runs both); Voice is the narration of the trailer and the campaign (`router.md` rule 7).
- ASSUMED (plan 02): the PCB board is not decided yet (S38); the router table uses "a motor driver PCB".
- ASSUMED (plan 02): the pairing token lives in `runs/.bridge-token` (gitignored, never printed by the bridge);
  the site keeps it in localStorage. `pnpm pair` prints a pairing link only when run in a terminal.
- ASSUMED (plan 02): the router's worker fallback and `defaultWorker` stay on `secondary`; `primary` is
  verified and can be chosen per module (`AgentOptions.worker`) or in `harness.local.json`.
- ASSUMED (plan 02): the author named a "high" effort model for the tests; the proxy lists only its "xhigh"
  variant, so `proxy.testModel` is that one (ids in `plan/LOCAL.md`).
- ASSUMED (plan 04): Cutout has no fallback to the image model, because that model's "transparent" output is a
  painted checkerboard, not alpha. Without the forge a Cutout cell fails with the reason.
- ASSUMED (plan 05): reel lengths are about 30 s for the premise and trailer and about 24 s for the
  explainer, shorter than each recipe as the author asked.
- ASSUMED (plan 05): the campaign's briefs come from a worker, with plain defaults for any audience it misses.
  The trailer belongs to the Unity audience (Unity gameplay) and the premise reel to the Roblox audience.
- ASSUMED (plan 04): Video is not built until the author chooses its runtime; the plan allows shipping it on
  the mock.
- ASSUMED (plan 06): the deployed site carries one take, the `main` fixture with its art, and replays it when no
  bridge answers. The Verifier fixes a cell at most once per run, then reports what is still wrong.

## Open problems

- The opening line no longer asks for a cloned voice, but the Voice cell still appears in S09 and S16. Since plan
  05 that is right: the reels ask Voice for their narration, each in its own recipe's voice.
- Audio files are not in git (`video/audio/` is ignored), except `video/makeasong.mp3`. `score.wav` and its
  takes live only on this machine; keep them. Regenerating from the seeds in `cues.json` may not give
  identical takes.
- `video/tools/marker.html` (the old two-track marker) is no longer used.
- (plan 05) A new bridge closes every run whose meta still says "running" as interrupted (`store.ts`), even when
  another bridge process (a `pnpm smoke`) still owns it. That process keeps running but writes to a closed run.
  Use one bridge at a time; a cell that is waiting must then be asked for again (the gate carry-over keeps the
  go).
- Unity automation is the harness's own editor bridge (a file queue); the editor must be open (plan 03).
- Unity 6 has no WebGL module yet (USER-TODO 1). `cloudflared` is the portable exe in `runs/.tools/` (plan 06).

## Per-plan log

| Plan | State | Verified by | Notes |
|---|---|---|---|
| 01 | done | typecheck, unit tests, determinism 96/96, live test, sheets, rough cut duration, lint:brand | See "The stage". Drafts S37-S40, S42-S47 left for plan 08. |
| 02 | done | typecheck, unit tests (none skipped), `pnpm dev`, real runs on both workers, no-network probes, proxy routing with both models, prompt.md module run, test:bridge, test:live, determinism, film:rough, lint:brand | See "The bridge". |
| 03 | done, two fallbacks | full run 20261113-014545, four follow-ups under 5 s, fixtures, typecheck, tests, test:bridge, test:live, determinism, film:rough, lint:brand | Windows build until WebGL is installed; Roblox place not opened in Studio. See "The games". |
| 04 | done, video on mock | runs 20261113-222539 (house chain), 20261113-223714 (song), 20261113-223729 (voice), 20261113-224654 (full game with real assets), fixtures, mock replay, tests, test:bridge, typecheck, lint:brand, forge stopped (`colab ls`: no sessions) | Video waits for its runtime; `assets.image` with `transparent` not run live; image quota out at the end. See "The assets". |
| 05 | done | trailer re-cut with the camera director (`trailer`, `trailer-2`, `trailer-3`: steady cameras, 9 angles, fights on screen, karts no longer twitch), test captures measured, contact sheets looked at, `reel.trailer` fixture re-recorded, typecheck, tests (protocol 13, web 7, bridge 63, reels 25 of them), lint:brand; premise picture day and night, the night re-render live through the cell (`premise-night`: Studio take, assembly, before/after), the recast (`premise-day`, `premise-night-2` recorded; `premise-night-3` reused the take), contact sheets looked at, `reel.premise` fixture re-recorded, typecheck, tests (protocol 13, web 7, bridge 59, reels 21 of them), lint:brand; earlier: tests (bridge 56, reels 18), campaign replayed from its fixture in mock mode, router re-record, test:bridge, test:live, determinism 96/96, film:rough (140.6 s, every cut on a beat), lint:brand, motion run + fixture, campaign live run end to end (trailer, explainer, premise narration, ads, publish dry run), fixtures for every reel module, HUD capture in Unity | Nothing published. See "The reels". |
| 06 | done, Unity browser build waiting on WebGL | `pnpm test:host` (public address answers, the page draws through it, tunnel closed with the bridge); the Verifier on a real run through `pnpm cell` (file deleted, marked failed, one fix, passed) and its 3 tests; Recorder 24 s video on run 20261113-224654; site deployed, replay with no bridge seen on pages.dev, tunnel + CORS + token checked from the shell; `pnpm stop` closed a detached tunnel; typecheck, tests (protocol 13, web 10, bridge 66), test:bridge, test:live, determinism 96/96, film:rough, lint:brand (and the built site) | Phone and second-device checks are the author's. See "Hosting, checking, recording". |
| 07 | not started | | |
| 08 | not started | | |
| 09 | not started | | |
| 10 | not started | | |
