# 06. Hosting, the verifier and the recorder

**Goal:** the game is playable from a public link, the site itself is online and reaches this computer when it
needs to, "make no mistakes" is a real Verifier cell, and "show the process on a video" is a real Recorder cell.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `plan/LOCAL.md`.

## Build

1. **`modules/host`** (tool). Serves a folder (the WebGL build) from the bridge's static server with the right
   headers for compressed Unity builds, opens a Cloudflare quick tunnel to it and publishes the URL as a `link`
   output with a browser-frame screenshot as evidence. The tunnel process is owned by the run and closed on
   cancel or when the author ends the session. Steps shown: build found, server up, tunnel up, URL answered.
2. **Relay through the tunnel.** Expose `/relay` (plan 03) on the same tunnel so the Roblox server can reach it.
   Write the URL into the Roblox place's config module via the Studio MCP.
3. **Roblox link.** `host` for Roblox = publish the place. This is an upload: **ask the author first**; without
   approval, output a "ready to publish" tile and a local play-test clip.
4. **The site online.** Deploy `apps/web` as a static site (Cloudflare Pages). It talks to the bridge either on
   `127.0.0.1` (same computer) or through a named tunnel address stored in Settings, always with the pairing
   token. Without a bridge the site still works in replay mode: it ships with one bundled take so visitors
   (and judges) can watch a run.
5. **`modules/verify`** (orchestrator, tool). Attaches a check to every sibling cell and reports pass/fail as a
   check mark on that cell (`node.step` with `icon: "check"` on the target, summary on its own cell):
   - build exists and loads in a headless browser without console errors;
   - public link answers 200 and the canvas renders a non-blank frame;
   - each video has the expected duration, resolution and an audio stream (ffprobe);
   - each image is non-blank and the right size;
   - Roblox place opens and a play test runs 5 s without script errors (Studio MCP console output).
   A failed check sends the failure text back to the owning module once (`ctx.request(owner, {fix: ...})`),
   then re-checks. One retry, then it reports honestly.
6. **`modules/recorder`** (tool). Produces a short "process video" of a run: uses director mode on the run's
   own events (plan 01) with an automatic camera (wide, then visit the three busiest cells, then the wall),
   captures frames with Playwright and encodes with ffmpeg. This is the same machinery plan 09 uses for the
   film, so build it as `video/tools/capture.mjs` and let the module call it.
7. **Session cleanup.** `pnpm stop` closes tunnels, editors the harness opened (never ones the author opened),
   and reminds about a running Colab runtime.

## Verify first

- `cloudflared` is installed (`USER-TODO` item 2) and a quick tunnel can be started without an account; what
  its URL output looks like. Named tunnel + Pages deploy need the author's Cloudflare login: add a `USER-TODO`
  item if not present, and keep the quick tunnel path working meanwhile.
- Unity WebGL compression setting versus the headers the static server sends.
- Playwright frame capture speed at 1920x1080 here (aim: under 100 ms per frame).

## Done when

- A game run ends with a public URL that loads the game on a phone on another network.
- Opening the deployed site on another device with the tunnel address and token shows the live graph.
- Deliberately breaking a build (delete a file) makes the Verifier mark that cell failed, trigger one fix and
  re-check.
- `recorder` turns a finished run into a 20-30 s mp4 where cells, zooms and evidence are visible.
- `pnpm stop` leaves no tunnel process running (check the process list).

## Hand off

`plan/STATUS.md`: tunnel type in use, deploy URL, capture speed in frames per second, verifier checks that are
still shallow.
