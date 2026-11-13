# game.roblox.build

The Build part of the Roblox game, hidden from the router. It lints the Luau with selene and builds place.rbxlx with rojo; not opened in Studio.

The runner is shared by all six parts: `../game.roblox/lib/parts.ts`. Mock: `fixtures/default.jsonl`,
recorded with `pnpm fixture <runId> <nodeId> game.roblox.build`.
