# game.roblox

The Roblox side of the game module, hidden from the router. It builds the same game as a Roblox place, from
Luau in a Rojo project.

- **Project:** `paths.robloxProject` (`runs/.game/roblox`) is reset from `template/` on every run.
  - `src/server/Race.server.luau`: builds the track from parts and runs the race (track-space karts, AI, laps,
    server-side combat, the crossplay relay over HttpService).
  - `src/client/Client.client.luau`: input, a chase camera that rolls through the loops, and the HUD.
  - `src/shared/`: `Track` (the centre line), `Look` (day, night, realistic) and three generated modules: `Config`
    (the design), `TrackData` (the centre line) and `Flags` (live follow-ups).
- **One track for both games:** the Track cell asks the Unity editor for the centre line (`track_export`, the same
  generator Unity uses) and writes it to `TrackData.luau`. It is stored as 3 studs per metre with the Z axis
  mirrored. So the Roblox track needs the Unity editor that the parallel Unity team opens.
- **Parts:** Track, Karts, Humanoids, Combat, UI and Build (`lib/parts.ts`). Each writes its section of
  `Config.luau` and switches its piece on.
- **Build:** runs `selene` (Roblox standard library) and then `rojo build -o place.rbxlx`. The place file is the
  cell's output.
- **Tools:** `rojo` and `selene`, pinned in `template/aftman.toml` (`aftman install`). `paths.rojo` and
  `paths.selene` override them.

**Built, not opened in Studio.** Nothing here opens Roblox Studio, so there are no Studio screenshots. The evidence
is drawn from the same data the place is built from (track from above and in profile, grid, rider, reach, HUD
layout), plus the Luau. Publishing the place needs the author's go-ahead. Roblox game servers cannot reach
`127.0.0.1`, so crossplay with a published place needs a tunnel to the bridge's `/relay`. Music needs an uploaded
audio id (`Flags.musicId`).

Mock: `fixtures/default.jsonl`, recorded with `pnpm fixture <runId> <nodeId> game.roblox`.
