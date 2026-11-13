# mock.asset

Test asset provider. It lets `ctx.request` / `request_asset` and the `node.request` / `node.deliver` handoff through
the Assets hub run without a generator. The runner falls back to it for any asset kind whose real module is not
installed yet. It answers with a file of that kind that a game can load:

| `params.kind` | File |
|---|---|
| `image` | a PNG texture (a pattern coloured from the prompt), plus the SVG card with the prompt written on it |
| `music` | an 8-bar WAV loop |
| `voice` | a short WAV of tones |
| `model3d` | a glTF box |
| anything else | the SVG card |

To test a handoff, point a kind at it with `assetKinds` in the config.

Mock: `fixtures/default.jsonl`, recorded from a real run with `pnpm fixture <runId> <nodeId> mock.asset`. It is
replayed when `HARNESS_MOCK=1`.
