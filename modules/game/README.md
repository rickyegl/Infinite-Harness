# game

Makes a playable kart racing game, with riders who fight while they race, from one request, and builds it in
both Unity and Roblox.

1. **Design** (`game.design`, a worker) writes `design.json` and a one-page `design.md`: track shape, loops,
   twists, banks, the drop and the hover sections, then the karts, riders, combat, HUD, look and a list of shared art.
   Every number is clamped to a safe range (`lib/design.ts`).
2. The orchestrator asks the asset hub for every piece of art at once (`ctx.request`). A failed request only loses
   that piece.
3. **Unity** (`game.unity`) and **Roblox** (`game.roblox`) start in parallel from the same design. Each draws its own
   tree of six parts: Track, Karts, Humanoids, Combat, UI and Build.

What was built, and where, goes in `runs/<id>/game-state.json` (`lib/state.ts`). The live follow-ups read it to find
the editor project, the build and the place without a worker:

| Follow-up | Module | What changes |
|---|---|---|
| "make it night" | `game.lighting` | night sky, lamps, glowing edges |
| "make it realistic" | `game.shaders` | realistic look, before and after shots |
| "add music" | `game.music` | race music in the build |
| "add crossplay" | `game.relay` | a relay room; each game shows the other's karts as ghosts |

The flags go into the running build's `StreamingAssets/harness.json`, which the game re-reads every 2 s. They also
go into the Roblox place's `Flags.luau`, and the place is rebuilt (`lib/live.ts`).

Mock: `fixtures/default.jsonl`, recorded from a real run with `pnpm fixture <runId> <nodeId> game`.
