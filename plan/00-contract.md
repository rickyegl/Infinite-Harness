# 00. Contract (every agent reads this first)

Not a task. This is the shared design that plans 01-10 build against. If a plan and this file disagree, this file
wins; if this file is wrong, fix it here in the same commit so the next agent inherits the fix.

## What we are building

**Infinite Harness**: one clean text box. You type or say anything; a router picks module agents and starts them;
you watch them work as a living graph instead of a chat. The showcase is building the same game in Unity and
Roblox at once, with trailers, ad reels, generated assets, CAD, and more hanging off the same tree.

The deliverable that matters most is a **demo film of at most 3 minutes** ([video/SHOTS.md](../video/SHOTS.md)). The UI is
designed for how it looks in that film. Deadline: 3 days. Most module internals already exist in the author's
other projects, so module work is "wrap what exists", not "write from scratch".

## Decisions already made (do not reopen)

| Topic | Decision |
|---|---|
| Film truth | Every module really runs once; its event log is recorded; the UI replays logs on the music's beat clock. |
| Editing | Plates are captured from the real UI in director mode; HyperFrames assembles them with audio. |
| Agent runtime | Headless agent CLIs spawned as workers (subscription sign-in and MCP servers come from the CLIs' own config). The router and tiny text tasks go through the local model proxy. |
| Unity | Unity 6 (6000.2.x) with the WebGL module, URP. Browser build is WebGL. |
| Where things run | About 90% on this computer. GPU jobs on a Colab runtime. Static site and public links through Cloudflare (Pages + tunnels). |
| Naming | **Brandless text, with one mark (changed 2026-11-12).** UI, film, README and docs name cells by capability (Game, Image, Voice). Model vendors are never named in text; their CLI names, model ids and paths live in `harness.local.json` and `plan/LOCAL.md` (both gitignored). **Exception: a cell whose asset is made by a non-LLM generator (image, cutout, 3D model, video, voice, music, forecast) shows that generator's icon**, see "Maker icons" below. Agent and orchestrator cells (the LLM workers) show no maker. Engines and partner tools (Unity, Roblox, Blender, SurfaceCAD) are named normally. |

## Repo layout

```
apps/web/            the site: Vite + React + TypeScript + GSAP. All eight views.
apps/bridge/         local daemon (Node 22 + TypeScript): runs modules, streams events, serves artifacts.
packages/protocol/   event + manifest types (TypeScript) shared by web and bridge.
modules/<id>/        one folder per module: module.json, run.ts, prompt.md (agent modules), README.md.
runs/                (gitignored) one folder per run: events.jsonl + artifacts/.
video/               shots.json, beats.json, takes/, tools/, HyperFrames project, renders/.
plan/                these files. docs/ = user-facing documentation.
harness.config.example.json   committed template.   harness.local.json   (gitignored) real paths and names.
```

Package manager: `pnpm` workspaces. Python tools are called as subprocesses, never imported.

## The one idea: UI = f(events, t)

The bridge emits an append-only event stream per run. The web app keeps no hidden state: the picture at time `t`
is a pure function of the events with `event.t <= t`. That single rule gives live mode (clock = now, events from
the WebSocket) and director mode (clock = seeked, events from a file) for free, and makes the film reshootable.

**Second input: the view.** Where the camera looks and which cell is in focus is not in the event stream. It is
a separate `ViewState` (camera target, focused node, active view). In live mode the viewer sets it: clicking a
cell zooms into its focus view, Escape or clicking outside zooms back. In director mode the shot's direction
file sets it. The picture is `f(events, t, view)`.

**Rendering rule:** no CSS transitions, no CSS keyframes, no `setTimeout`-driven visuals. All motion comes from
one seekable GSAP master timeline built from the events, or from plain functions of `(t - event.t)`. Fonts and
icons are bundled locally. Video inside the UI goes through one `FrameClip` component (live: `<video>`; director
mode: numbered frames by `t`).

### Event protocol (`packages/protocol`)

One JSON object per line in `runs/<run>/events.jsonl`, and the same objects over the WebSocket.

```ts
type Base = { seq: number; t: number /* ms since run start */; run: string; node: string };
type Event = Base & (
  | { type: "run.start"; prompt: string }
  | { type: "node.spawn"; parent: string | null; module: string; label: string;
      kind: "root" | "orchestrator" | "agent" | "tool"; prompt?: string;
      maker?: string }                                    // icon id of the non-LLM generator, see "Maker icons"
  | { type: "node.state"; state: "queued" | "running" | "waiting" | "done" | "failed" }
  | { type: "node.step"; title: string; detail?: string; icon?: string }   // a tick in the step ticker
  | { type: "node.evidence"; kind: "image" | "frames" | "video" | "model3d" | "audio" | "chart" | "doc" | "code" | "link";
      uri: string; thumb?: string; caption?: string; meta?: Record<string, unknown> }
  | { type: "node.request"; to: string; what: string; requestId: string }  // travelling light on an edge
  | { type: "node.deliver"; to: string; requestId: string; uri: string }   // the answer travelling back
  | { type: "node.output"; name: string; uri: string; kind: string; href?: string } // a tile on the wall
  | { type: "node.done"; summary: string }
  | { type: "node.error"; message: string }
  | { type: "run.done" }
);
```

`uri` is relative to the run folder (`artifacts/...`) and served by the bridge at `/runs/<run>/<uri>`. `label`
is what the UI prints: a capability word, never a vendor. `maker` is never printed as text: it only picks an
icon. Adding an event type means editing this file and the
protocol package in the same commit.

### Module contract (`modules/<id>/`)

```jsonc
// module.json
{ "id": "assets.image", "label": "Image", "icon": "image", "kind": "tool",          // or "agent" | "orchestrator"
  "maker": "<icon id>",                                                              // only for non-LLM generators
  "summary": "Generate or edit an image from a prompt.",                             // read by the router
  "accepts": ["text", "image"], "produces": ["image"],
  "runtime": "script",                                                               // "script" | "cli-agent"
  "needs": ["proxy"], "mock": true,
  "hidden": false,                                                                   // optional, see below
  "allow": { "tools": ["harness.*"], "write": ["$RUN"], "network": ["proxy"] } }      // enforced, see below
```

`hidden: true` marks a part of another module (the engine parts `game.unity.track` and so on): its parent's
`run.ts` spawns it with `ctx.spawn`, and the router never offers it.

`allow` is a hard limit applied by the worker adapter, not a suggestion in a prompt: which MCP servers and tools
the worker may call, which folders it may write, which hosts it may reach. Workers run unattended, so anything
not listed is denied. Examples: `study` gets only read tools of the course server; `publish` gets no network.

`allow` vocabulary (as built in plan 02; the bridge refuses a manifest that uses anything else):

| Field | Values |
|---|---|
| `tools` | `harness.*` or `harness.<tool>` (the bridge's MCP server); `<server>.*` or `<server>.<tool>` (an MCP server from the worker CLI's own config); `shell` (run commands; **requires `network: ["*"]`**, because a shell here can reach any host); `web` (fetch and search). |
| `write` | `$RUN` (the run folder), `$NODE` (this cell's artifact folder), `$paths.<key>` (a config path), or a repo-relative folder. The worker's own working folder is always writable. |
| `network` | `*`, `proxy`, or host names. Without `shell` or `web` a worker has no tool that reaches a host, so names other than `*` are recorded but not enforced host by host. |

The types a `run.ts` receives (`ModuleContext`, `AgentOptions`, `AgentResult`, `ShResult`, `ModuleRun`) live in
`@harness/protocol` (`packages/protocol/src/manifest.ts`). An agent module without `run.ts` runs as one worker:
its `prompt.md` leads and the cell's task follows.

```ts
// run.ts
export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput>;
// ctx.step(title, detail?) ctx.evidence(kind, file, caption?) ctx.output(name, file, kind, href?)
// ctx.state("waiting" | "running")                      <- the cell waits on the author (a script gate), then resumes
// ctx.request(moduleId, input): Promise<ModuleOutput>   <- asset handoff: emits node.request / node.deliver
// ctx.ask(node, {prompt}): Promise<ModuleOutput>        <- work back to a finished cell (the Verifier's fix): it
//                                                          reruns in place with its first input + params.fix
// ctx.mark(node, title, detail?, icon?)                 <- a step on another cell (the Verifier's check mark)
// ctx.spawn(moduleId, input, {label})                  <- child cell under this node
// ctx.sh(cmd, args, opts) ctx.agent(prompt, opts)      <- subprocess / headless CLI worker, events streamed
// ctx.dir (artifact dir) ctx.config (merged config) ctx.signal (abort)
// ctx.config.bridge.url: where this bridge really listens (the configured port can be 0 in tests)
```

**Maker icons.** A module with `"kind": "tool"` whose output is made by a non-LLM AI generator sets `maker` to
an icon id. The bridge copies it from the manifest into that cell's `node.spawn` (workers cannot set it), so it
is recorded in every take and replays in the film. The UI draws `apps/web/public/makers/<maker>.svg` as a small
single-colour badge on the cell, with a neutral glyph when the file is missing. This is the only place a
generator's brand may appear: the icon is its glyph, not its wordmark, and its name is never printed in labels,
captions, steps or docs. Modules with `"kind": "agent"` or `"orchestrator"` never set it. The brand lint skips
exactly two things: the `maker` value in `module.json` and in `node.spawn` events, and the files in
`apps/web/public/makers/`. Which generator sits behind each module is listed in `plan/LOCAL.md`.

Every module must run with `HARNESS_MOCK=1` (`"mock": true`): it replays `modules/<id>/fixtures/` so the UI and
the film pipeline never wait for a GPU, an editor or a quota.

Fixture format: `fixtures/<name>.jsonl` holds the cell's events without `seq` and `run`. `node` is `"."` for the
cell itself and a relative id for its children (`"formal"` becomes `<cell>.formal`); `t` is ms since the cell
spawned, divided by `mock.speed` on replay; a `uri` of `"./<name>/<file>"` points into `fixtures/<name>/` and is
copied into the run. Make one from a real run with `pnpm fixture <runId> <nodeId> <module> [name]`. The recorder
stops at the cell's own `node.done` (follow-ups spawned under it later belong to their own modules), does not copy
executables, and re-encodes a video over 1.5 MB to 960 px wide.

### Agents inside the graph: the harness MCP server

The bridge exposes its own MCP server to every CLI worker it spawns. That is how a sub-orchestrator draws its own
tree and asks other modules for assets:

| Tool | Effect |
|---|---|
| `report_step(title, detail?)` | `node.step` on the caller's cell |
| `attach_evidence(path, kind, caption?)` | copies the file into the run and emits `node.evidence` |
| `spawn_task(label, module?, prompt)` | child cell; runs a module or a sub-agent; returns its result |
| `request_asset(kind, prompt, refs?)` | routes to an asset module, waits, returns a local file path |
| `publish_output(name, path, kind, href?)` | tile on the deliverables wall |

`spawn_task` with `module` runs that installed module with its own `allow`; an unknown id is an error. Without
`module` it runs a sub-agent with the caller's grants (one level down; a sub-agent's own sub-agents lose
`spawn_task`). `request_asset` picks the module from config `assetKinds`.
The server is `apps/bridge/src/mcp/harness-mcp.mjs`, started per worker with `HARNESS_BRIDGE`,
`HARNESS_TOKEN_FILE`, `HARNESS_RUN`, `HARNESS_NODE`, `HARNESS_CWD` and `HARNESS_TOOLS` (the granted tools). It
calls back into the bridge; it never sees the token in its arguments.

### Record and replay

A **take** is a finished run copied to `video/takes/<take>/` (events + only the artifacts the film shows). Takes
may be trimmed and re-timed by `video/tools/` but never hand-written: a take always starts as a real run.

### Running, hosting and stopping (plan 06)

| Command | What it does |
|---|---|
| `pnpm cell <runId\|new> <module> [prompt]` | one module as a new cell of a run, without the router |
| `pnpm bridge:public` | the bridge plus a quick tunnel to it; prints the public address (and, on a terminal, a link that pairs the deployed site) |
| `pnpm record --run <id>` | the run's 20-30 s process video (the Recorder's cut); token from `HARNESS_TOKEN` |
| `pnpm stop` | closes every tunnel and editor the harness started (by the pids in `runs/.procs.json`, never by program name) and reminds about a Colab runtime still up |
| `pnpm test:host` | the Host cell over the real network on a throwaway run |

Tunnels are Cloudflare quick tunnels (`paths.cloudflared`). Each belongs to a run (or to `bridge:public`) and
closes with it, when the bridge stops, or on `pnpm stop`. The deployed site (`bridge.origins`) calls the bridge
on 127.0.0.1 or through such a tunnel, always with the pairing token; with no bridge answering it replays the
bundled take. The stage's `?director=1&run=<id>` is the Recorder's automatic cut.

## Config

`harness.config.example.json` lists every key with a safe placeholder; `harness.local.json` overrides it. Code
reads paths, CLI commands, model ids and ports **only** through the config loader. Secrets stay in the `.env`
files of the projects that own them, loaded by path; they are never copied, printed, logged or committed.

## Sibling projects (use in place, never copy, never modify)

Referenced by config key; real paths are in `plan/LOCAL.md`.

| Key | What it is |
|---|---|
| `paths.studio` | Video studio: trailer, premise reel and explainer pipelines, narration, captions, assembly, HyperFrames. |
| `paths.forge` | Colab asset forge: image, cutout, image-to-3D, texture, low-poly export, rig, with REST API and MCP server. |
| `paths.proxy` | Local model proxy (standard chat-completions API, port in `proxy.baseUrl`) with the subscription sign-ins. |
| `paths.unityEditor`, `paths.blender`, `paths.ffmpeg` | Installed tools. |
| `paths.canvasMcp`, `paths.frcSim` | Course MCP server and the FRC simulator project. |

Their own rules still apply and are binding here:
- Ask the author before anything that publishes, uploads or schedules, before heavy voice-credit use
  (more than about three full scripts in a session), before large downloads and before changing system settings.
- Stop the Colab GPU runtime when a session's GPU work is done.
- Never print or commit keys.

## Rules for every agent

1. Read this file, then your plan file, then `plan/STATUS.md`. Do the "Verify first" items before writing code:
   confirm CLI flags, model ids and tool names against `--help`, the tool's own docs or a live call. Do not trust
   memory for them.
2. Keep assumptions visible: anything you decide that the author did not is an `ASSUMED:` line in `plan/STATUS.md`.
3. Finish with the plan's verification command passing, then update `plan/STATUS.md` (done, how verified, open
   problems, next file) and the affected docs, then commit and push. Git is not the point: one commit per plan
   file is fine, messages short. **Every commit message ends with the co-author trailer in `plan/LOCAL.md`
   ("Commit trailer")**, whichever tool or model made the change (see `AGENTS.md`).
   **The film must always exist.** From plan 01 on, `pnpm film:rough` renders the whole film (its length is `total` in `video/timeline.json`, never over 180 s) from whatever
   is there (fixtures at first). It must still pass when you finish. Each plan swaps fixtures for real takes,
   shot by shot, so there is a showable film at the end of every day.
4. Behind schedule? Cut in this order: polish, then live runs of long-tail modules (keep their mock), then
   long-tail modules themselves. Never cut director mode, the game flow or the film assembly.
5. Blocked on something only the author can do?
   - **Needed now** (open a program, start or connect the Colab runtime, an API or sign-in, an unanswered
     question, any other blocker): you may stop and ask. Say the exact action or question, what it unblocks and
     what you will do next, and write it under "Waiting on the author" in `plan/STATUS.md` (see `AGENTS.md`
     rule 5). Do not report a mock as the real thing.
   - **Slow** (an install, a recording): add it to `plan/USER-TODO.md`, keep the mock path working and
     continue with other work.

## ASSUMED (author can overrule)

- Film is 16:9 1080p60; reels are shown inside it.
- Crossplay is real but minimal: kart transforms relayed through the bridge between the browser build and the
  Roblox server. If it is not stable by the capture day, the shot is staged with two recorded windows.
- "Make it realistic" is a URP upgrade (post-processing, lighting, reflections) in the same project.
- The song for "add music" and the FRC simulator clip are files the author supplies.
- PCB module uses a code-to-board tool that needs no desktop EDA install; the board and the demand dataset are the
  author's choice.
- "Design the house" produces DXF (shown as drawing lines); converting to DWG is optional.
- Sign-in screen says "Connect your AI subscription"; provider names appear only there, read from config.
