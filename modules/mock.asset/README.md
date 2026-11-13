# mock.asset

Test asset provider. Draws a placeholder SVG with the prompt written on it and delivers it, so
`ctx.request` / `request_asset` and the `node.request` / `node.deliver` handoff through the Assets hub
run without a generator. Point a kind at it with `assetKinds` in the config to test a handoff.

Mock: `fixtures/default.jsonl`, recorded from a real run with
`pnpm fixture <runId> <nodeId> mock.asset`. Replayed when `HARNESS_MOCK=1`.
