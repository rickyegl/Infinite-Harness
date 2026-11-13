# game.unity.build

The Build part of the Unity game, hidden from the router. It race-tests on autopilot, records 10 s of play to mp4 and builds the player.

The runner is shared by all six parts: `../game.unity/lib/parts.ts`. Mock: no fixture of its own; the `game.unity` fixture replays this part with the rest of the Unity game.
