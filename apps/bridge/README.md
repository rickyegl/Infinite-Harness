# Bridge

The local daemon. It takes a prompt, routes it to modules, runs them (scripts or headless agent CLI workers),
writes every event to `runs/<id>/events.jsonl` and streams the same events to the site.

```
pnpm dev            bridge (127.0.0.1:7411) and site (127.0.0.1:5173) together
pnpm pair           prints the site link that pairs this browser with the bridge (only on a terminal)
```

Open the link `pnpm pair` prints once, or paste the pairing token (`runs/.bridge-token`) into the settings sheet
(the gear on the prompt screen). The token is made on first start and never printed by the bridge itself.

## Config

`harness.config.example.json` lists every key; `harness.local.json` (gitignored) is merged over it key by key.
Environment overrides: `HARNESS_MOCK=1|0`, `HARNESS_MOCK_SPEED`, `HARNESS_PORT`, `HARNESS_RUNS`, `HARNESS_CONFIG`.

| Key | Meaning |
|---|---|
| `bridge.port`, `bridge.host`, `bridge.runsDir`, `bridge.tokenFile` | Where it listens and stores runs. Host is always loopback. |
| `proxy.baseUrl`, `proxy.routerModel`, `proxy.signInUrl` | The local model proxy, the model real runs route with, and its sign-in page. |
| `proxy.testModel` | The model the tests and `record:router` route with instead of `routerModel` (cheaper, faster). |
| `proxy.apiKeyEnv`, `proxy.keyFile`, `proxy.keyField` | The key comes from the env variable named by `apiKeyEnv`; when it is not set, it is read by path from `keyFile` (the proxy's own config, field `keyField`, default `api-keys`). Never copied into this repo, printed or logged. |
| `router.worker`, `router.timeoutMs` | The worker the router falls back to when the proxy is down or returns a bad plan. |
| `workers.<name>` | `{ adapter, cmd, args, model?, timeoutMs }`. `adapter` is `exec-jsonl` or `stream-json`. |
| `defaultWorker` | Worker for `ctx.agent` and `spawn_task` sub-agents when a module does not choose. |
| `mock.enabled`, `mock.speed` | Replay module fixtures and recorded router plans instead of calling anything. |
| `assetKinds` | Which module answers `request_asset(kind)`. |

## HTTP and WebSocket

Every request carries the token: `Authorization: Bearer <token>`, `?token=`, or a `/t/<token>/` path prefix
(used for `<img src>` and other plain links). Browsers are accepted only from loopback origins.

| Request | What |
|---|---|
| `POST /runs {prompt}` | Starts a run; returns `{ id, startedAt }`. |
| `GET /runs`, `GET /runs/<id>` | Recent runs; one run's meta (`state`: running, done, failed). |
| `WS /runs/<id>/events?seq=N` | Every event after `seq` N, then live events until `run.done`. A reload asks from 0. |
| `GET /runs/<id>/events?seq=N` | The same as NDJSON. |
| `GET /runs/<id>/<uri>` | An artifact. Dotfiles and paths outside the run are refused. |
| `POST /runs/<id>/say {text}` | Follow-up on the same graph: routed with the existing cells as context. |
| `POST /runs/<id>/cancel` | Aborts every cell; they end in `node.error`. |
| `GET /modules`, `GET /health` | Installed modules; status. |
| `GET /proxy/status`, `GET /proxy/signin` | Whether the model proxy answers; its sign-in page for "Connect your AI subscription". |

## Runs, routing, modules

- **Store.** Append plus fsync per event. On start, a run a previous process left `running` is closed: every open
  cell gets `node.error`, then `run.done`, and the run is marked failed. A torn last line is cut off.
- **Router.** `router.md` is the prompt. First choice: the proxy with a JSON schema (`proxy.routerModel`); a
  model that refuses the proxy's JSON mode (HTTP 400) is asked again with the schema in its instructions, and
  either answer must pass `checkPlan`. Fallback: one call to `router.worker` with the same schema. In mock
  mode, recorded plans in `fixtures/router/` are used first. `pnpm --filter bridge record:router` re-records them.
- **Modules.** `modules/*/module.json` is validated at start. The maker icon comes from the manifest only.
  A module without `run.ts` runs as one worker with its `prompt.md`. With `HARNESS_MOCK=1` each module
  replays `modules/<id>/fixtures/*.jsonl`.
- **Workers.** `allow` is enforced through each CLI's own settings (tool lists, sandbox, extra writable folders),
  never through prompt wording. See "allow" in `plan/00-contract.md`. `test/allow.test.ts` checks the arguments
  and asks every configured worker to fetch a local URL with no network grant: the server must see zero hits.
- **Harness MCP server** (`src/mcp/harness-mcp.mjs`): `report_step`, `attach_evidence`, `spawn_task`,
  `request_asset`, `publish_output`. Each worker gets only the tools its module's `allow` lists.

## Scripts

| Command | What |
|---|---|
| `pnpm smoke ["prompt"]` | Starts a bridge on a free port, runs the prompt, prints each event. `HARNESS_BRIDGE=<url>` uses the running one. |
| `pnpm take <runId> <take>` | Copies a run's events and the artifacts they reference to `video/takes/<take>/`. Replay: `/?director=1&take=<take>`. |
| `pnpm fixture <runId> <nodeId> <module> [name]` | Turns one cell of a real run (and its subtree) into `modules/<module>/fixtures/<name>.jsonl`. |
| `pnpm --filter bridge record:router [filter]` | Routes every table case for real and saves the plans. |
| `pnpm --filter bridge test` | Store, server, router table, allow (the live probe skips with `HARNESS_LIVE=0`). |
| `pnpm test:bridge` | The site in live mode against a mock bridge: prompt, reload mid-run, graph equals events.jsonl, offline take replay. |
