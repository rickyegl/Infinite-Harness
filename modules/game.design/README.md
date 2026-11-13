# game.design

The design cell of the game module. A worker answers `prompt.md` with one JSON object that follows a strict
schema (`../game/lib/design.ts`). The script clamps every number, then writes `design.json` (what both engine teams
build from) and `design.md` (the one-page design shown as doc evidence).

Mock: `fixtures/default.jsonl`, recorded with `pnpm fixture <runId> <nodeId> game.design`.
