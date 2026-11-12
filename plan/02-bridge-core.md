# 02. The bridge: runs, router, workers, harness MCP, live mode

**Goal:** typing a prompt in the site starts real work on this computer and the graph draws it live. Ends with a
real run made only of mock modules plus one real CLI worker.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `plan/LOCAL.md` (worker commands, proxy
address).

## Build

1. **`apps/bridge`** (Node 22 + TypeScript, `tsx` in dev). HTTP + WebSocket on `bridge.port`, bound to
   127.0.0.1. Endpoints: `POST /runs {prompt}`, `GET /runs/:id/events` (WebSocket, replays from `seq`),
   `GET /runs/:id/<artifact>`, `POST /runs/:id/say {text}` (a follow-up instruction to a finished or running
   run, used by Act 3), `POST /runs/:id/cancel`, `GET /modules`, `GET /health`. A pairing token (printed at
   start, stored by the site) is required on every request.
2. **Run store.** `runs/<id>/events.jsonl` (append, fsync per event), `artifacts/`, `meta.json`. Restart-safe:
   an interrupted run is marked failed, never resumed silently.
3. **Config loader.** Merges `harness.config.example.json` and `harness.local.json`; typed; one import for all
   code. Write the example file with every key the plans mention.
4. **Module loader and runner.** Discovers `modules/*/module.json`, validates against the protocol types, builds
   `ModuleContext` (contract section "Module contract"). `HARNESS_MOCK=1` replays a module's fixtures with their
   original timing scaled by `HARNESS_MOCK_SPEED`.
5. **Router.** Input: prompt + module summaries. Output: a plan `{nodes: [{id, module, label, prompt,
   after: []}]}` as strict JSON. First choice: one call to the local proxy's chat-completions endpoint with a
   JSON schema. Fallback when the proxy is down: one headless worker call with the same schema. The router
   prompt is a file (`apps/bridge/router.md`) and is covered by table tests: the Act 1 prompt must produce Game
   (Unity + Roblox), Trailer, Campaign, Voice, Host, Recorder, Verifier; each Act 5 prompt must map to its
   module.
6. **Worker adapter.** `ctx.agent(prompt, opts)` spawns a headless agent CLI from `workers.<name>` in config
   (command, args template, how to pass an MCP config, how to get JSON event output), parses its event stream
   and maps tool calls to `node.step`, files written to facts, and final text to `node.done`. It enforces the
   module's `allow` block (contract): only the listed MCP servers and tools are passed to the worker, writes are
   confined to the listed folders, and anything else is denied by the CLI's own permission settings, not by
   prompt wording. Test: a worker for a module without network access cannot fetch a URL. Two adapters, one
   per installed CLI; pick per module with `opts.worker`. Each worker gets a fresh working directory inside the
   run unless the module names a project folder.
7. **Harness MCP server.** stdio MCP server started by the bridge per worker, carrying the caller's node id in
   its environment. Tools exactly as in the contract (`report_step`, `attach_evidence`, `spawn_task`,
   `request_asset`, `publish_output`). `request_asset` resolves `kind` to a module through a small table
   (`image`, `model3d`, `video`, `voice`, `music`) and emits `node.request` / `node.deliver`.
8. **Mock modules.** `mock.echo` (tool), `mock.agent` (spawns three children with evidence), `mock.asset`.
9. **Site, live mode.** Settings sheet: bridge address + pairing token; "Connect your AI subscription" opens
   the proxy's own sign-in page and shows connected or not from the proxy's model list. Prompt view posts
   `/runs`, then the graph subscribes to events. Microphone button fills the box with browser speech
   recognition (typing still works).
10. **Recorder hook.** Every run is already a recording. Add `pnpm take <runId> <take>`: copies events and the
    referenced artifacts to `video/takes/<take>/`.

## Verify first

- Each worker CLI's real flags for non-interactive mode, JSON event output, working directory, permission
  bypass for unattended runs and per-invocation MCP config (`<cli> --help`; record the working command lines in
  `plan/LOCAL.md`).
- The proxy's model list endpoint and one chat call with a JSON schema; record the model id that answers
  fastest in `harness.local.json`.
- MCP SDK version and stdio server shape.

## Done when

- `pnpm dev` starts bridge + site. Typing "say hello three ways" produces a run whose graph matches its
  `events.jsonl`, live.
- Reloading the page mid-run rebuilds the same picture from `seq 0`.
- A real worker run calls `report_step` and `spawn_task` through the harness MCP and the child cells appear.
- `pnpm test` passes: reducer tests, router table tests (against recorded router outputs, plus one live call
  when the proxy is up), run-store restart test.
- `pnpm take <id> smoke` then `/?director=1&take=smoke` replays the same run offline.

## Hand off

`plan/STATUS.md`: exact worker command lines that worked, the router model id key, latency of a router call,
and anything the worker adapters cannot observe.
