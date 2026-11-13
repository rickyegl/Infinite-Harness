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
- **Live flags:** `Assets/StreamingAssets/harness.json` (night, realistic, music, relay); `RuntimeFlags` re-reads it
  every 2 s.

`lib/cli.ts` runs one op by hand.

Mock: `fixtures/default.jsonl`, recorded with `pnpm fixture <runId> <nodeId> game.unity`.
