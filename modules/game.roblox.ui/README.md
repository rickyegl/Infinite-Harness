# game.roblox.ui

The UI part of the Roblox game, hidden from the router. It switches on the ScreenGui HUD (lap, place, speed, countdown, feed, results, minimap); draws the layout.

The runner is shared by all six parts: `../game.roblox/lib/parts.ts`. Mock: `fixtures/default.jsonl`,
recorded with `pnpm fixture <runId> <nodeId> game.roblox.ui`.
