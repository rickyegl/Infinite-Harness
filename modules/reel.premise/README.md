# reel.premise

A vertical Roblox premise Short in the studio's premise recipe (`premise/HOW_TO.md`), set in the run's own racing
game: about 30 s (the recipe runs 35-45 s), 9:16, in the premise narrator's voice.

- **Script:** Template A. The first spoken words are always "In this world," then the rule ("whenever you X, Y"),
  examples, the exception kid aged 12-16, the turn, the escalation, "<Name> froze." and a reframe that ends on the
  punchline. A worker writes it from `script.md` with the game's design (title, track, the four rider classes);
  113-125 spoken words at the narrator's 4.1 words a second. A draft that is out of range or opens any other way
  is rewritten up to twice, and the cell refuses a script that does not open with "In this world,".
- **Gate:** the cell stops at "Waiting for your go" before any voice credit is spent (`_shared/gate.ts`).
- **Narration:** the Voice cell's `premise` preset (the recipe's narrator, fx A, speed 1.15; the voice id lives
  in `harness.local.json` only), cached by text and voice.
- **Picture:** the recipe's sets, cast, shot list and Studio capture start only after the author's green flag
  for the combined recording set and racing place in Roblox Studio. Until then the cell ends after the narration
  and says so; it never stands in a fake video. `params.lighting` ("day" or "night") is kept for the re-render.
- **Files:** `narration.wav`, `premise.json`.
