# game.unity

The Unity side of the game module, hidden from the router.

- **Project:** a warm Unity 6 project at `paths.unityProject` (`runs/.game/unity`). It is unpacked once from the
  editor's URP template, and then `template/` is copied over it. The scripts live in `template/Assets/Game`; the
  editor bridge is `template/Assets/Harness/Editor/HarnessBridge.cs`.
- **Driving the editor:** `lib/unity.ts` opens the editor once and sends it ops through a file queue: `setup`,
  `rebuild`, `info`, `track_export`, `shot`/`shots`, `import`, `play_capture`, `play_test`, `build`, `ping`. The
  editor compiles changed scripts during `setup`'s asset refresh, so after a `.cs` change the orchestrator waits
  for the compile and runs `setup` again.
- **Parts:** six child cells, one after another, because they share one editor and one `game.json`. Each writes its
  section and attaches at least two editor shots. They are Track, Karts, Humanoids, Combat, UI and Build
  (`lib/parts.ts`). Build race-tests on autopilot, records 10 s of play to mp4, and builds the player: WebGL when the
  editor has that module, otherwise Windows.
- **Track:** loops, twists, banks, a drop and hover sections. Karts drive in track space (distance along the centre
  line, offset from the centre), so they stay on the road upside down.
- **Generated models:** the kart body, the four rider classes, the landmarks and the trophy come from
  `assets.model3d` as OBJ sets copied to `Assets/Game/Resources/Models/<slot>/`. They already face +Z, so their
  yaw is 0. `Editor/ModelImport.cs` keeps those meshes readable, so `Models.Seat` can find the kart's seat from its
  vertices and sit the rider in it. A slot without a model keeps the primitive parts.
- **Rider classes:** volt (electric dash), sniper (mouse crosshair, one shot every 10 s), shrink (small and fast,
  slowed hard when touched) and thrower (an item forward every 3 s), in `Abilities.cs`.
- **Scenery:** `Scenery.cs` fills the world around the track, seeded from the track: a ring of low-poly mountains,
  rocks, bushes, flowers, flags and a grandstand on the ground; hot-air balloons, floating islands, clouds, a blimp
  and arches over the straights in the air. Nothing is placed on the road, the landmarks or the trophy.
- **Clearance:** `TrackMath` lifts the centre line wherever the road edge, a banked side or a twist would dip into
  the ground, and smooths the lift so the road never steps.
- **Live flags:** `Assets/StreamingAssets/harness.json` (night, realistic, music, relay); `RuntimeFlags` re-reads it
  every 2 s.

`lib/cli.ts` runs one op by hand.

Mock: `fixtures/default.jsonl`, recorded with `pnpm fixture <runId> <nodeId> game.unity`.
