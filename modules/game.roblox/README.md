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
- **Rider classes:** every kart has one of four classes, each with its own gear and attack, all resolved on the
  server: Volt (electric dash every 4 s, zaps karts it touches), Sniper (mouse crosshair, one shot every 10 s; the
  client sends its aim ray), Shrink (small and fast for 4 s every 9 s, but a touch while small squashes it) and
  Thrower (throws an item forward every 3 s). Players ride `riders.player` (Sniper by default); AI karts take the
  others in turn. Use and hit counts are kept as `Uses_<class>` and `Hits_<class>` attributes on `workspace.Karts`.
- **Generated 3D models:** the kart body, the four riders, four trackside landmarks and the finish trophy come from
  `assets.model3d`. The place loads each one with `InsertService:LoadAsset` from a Roblox asset id in
  `Config.models`; a slot without an id keeps its part-built version. Each `model.glb` is uploaded once as a Model
  asset on the author's account, **only with the author's go-ahead for that batch**, and recorded by file hash in
  `runs/.cache/roblox-assets.json` (`lib/assets.ts`), so a rebuild finds its ids. The orchestrator writes the files
  still waiting for an upload to `uploads.json`, and the build report lists which slots are part-built.
  - The place cannot read an inserted model's vertices, so the orchestrator finds the rider's seat in the kart
    from its OBJ (`lib/seat.ts`, the same method as the Unity game) and writes it into `Config.models.kart.seat`.
- **Scenery:** `src/server/Scenery.luau` fills the world round the circuit like the Unity game, seeded from the
  track: terrain mountains with snow on the tall ones, rocks, bushes, flower beds, flags and a grandstand on the
  ground; hot-air balloons, floating islands, Roblox clouds plus low puffs, a blimp and arches in the air. The
  client moves them locally (tags `SceneryBob`, `ScenerySpin`, `SceneryWave`).
- **Build:** runs `selene` (Roblox standard library) and then `rojo build -o place.rbxlx`. The place file is the
  cell's output.
- **Tools:** `rojo` and `selene`, pinned in `template/aftman.toml` (`aftman install`). `paths.rojo` and
  `paths.selene` override them.

**Built, not opened in Studio.** Nothing here opens Roblox Studio, so there are no Studio screenshots. The evidence
is drawn from the same data the place is built from (track from above and in profile, grid, rider classes, attacks,
HUD layout), plus the Luau. Publishing the place needs the author's go-ahead. Roblox game servers cannot reach
`127.0.0.1`, so crossplay with a published place needs a tunnel to the bridge's `/relay`. Music needs an uploaded
audio id (`Flags.musicId`).

Mock: `fixtures/default.jsonl`, recorded with `pnpm fixture <runId> <nodeId> game.roblox`.
