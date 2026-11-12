# 00. Contract (every agent reads this first)

Not a task. This is the shared design that plans 01-10 build against. If a plan and this file disagree, this file
wins; if this file is wrong, fix it here in the same commit so the next agent inherits the fix.

## What we are building

**Infinite Harness**: one clean text box. You type or say anything; a router picks module agents and starts them;
you watch them work as a living graph instead of a chat. The showcase is building the same game in Unity and
Roblox at once, with trailers, ad reels, generated assets, CAD, and more hanging off the same tree.

The deliverable that matters most is a **3-minute demo film** ([video/SHOTS.md](../video/SHOTS.md)). The UI is
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
| Naming | **Brandless.** UI, film, README and docs name cells by capability (Game, Image, Voice). Model vendors are never named in the repo; their CLI names, model ids and paths live in `harness.local.json` and `plan/LOCAL.md` (both gitignored). Engines and partner tools (Unity, Roblox, Blender, SurfaceCAD) are named normally. |

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
      kind: "root" | "orchestrator" | "agent" | "tool"; prompt?: string }
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
is what the UI prints: a capability word, never a vendor. Adding an event type means editing this file and the
protocol package in the same commit.

### Module contract (`modules/<id>/`)

```jsonc
// module.json
{ "id": "assets.image", "label": "Image", "icon": "image", "kind": "tool",          // or "agent" | "orchestrator"
  "summary": "Generate or edit an image from a prompt.",                             // read by the router
  "accepts": ["text", "image"], "produces": ["image"],
  "runtime": "script",                                                               // "script" | "cli-agent"
  "needs": ["proxy"], "mock": true }
```

```ts
// run.ts
export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput>;
// ctx.step(title, detail?) ctx.evidence(kind, file, caption?) ctx.output(name, file, kind, href?)
// ctx.request(moduleId, input): Promise<ModuleOutput>   <- asset handoff: emits node.request / node.deliver
// ctx.spawn(moduleId, input, {label})                  <- child cell under this node
// ctx.sh(cmd, args, opts) ctx.agent(prompt, opts)      <- subprocess / headless CLI worker, events streamed
// ctx.dir (artifact dir) ctx.config (merged config) ctx.signal (abort)
```

Every module must run with `HARNESS_MOCK=1` (`"mock": true`): it replays `modules/<id>/fixtures/` so the UI and
the film pipeline never wait for a GPU, an editor or a quota.

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

### Record and replay

A **take** is a finished run copied to `video/takes/<take>/` (events + only the artifacts the film shows). Takes
may be trimmed and re-timed by `video/tools/` but never hand-written: a take always starts as a real run.

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
   file is fine, messages short.
4. Behind schedule? Cut in this order: polish, then live runs of long-tail modules (keep their mock), then
   long-tail modules themselves. Never cut director mode, the game flow or the film assembly.
5. Blocked on something only the author can do (a sign-in, an install, a recording)? Add it to
   `plan/USER-TODO.md`, keep the mock path working and continue.

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
