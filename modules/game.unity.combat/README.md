# game.unity.combat

The Combat part of the Unity game, hidden from the router. It sets the swing, hit and knock-back rules and attaches editor shots.

The runner is shared by all six parts: `../game.unity/lib/parts.ts`. Mock: no fixture of its own; the `game.unity` fixture replays this part with the rest of the Unity game.
