# reel.premise

A vertical Roblox premise Short in the studio's premise recipe (`premise/HOW_TO.md`), set in the run's own racing
game: about 30 s (the recipe runs 35-45 s), 9:16, in the premise narrator's voice.

- **Script:** Template A. The first spoken words are always "In this world," then the rule ("whenever you X, Y"),
  examples, the exception kid aged 12-16, the turn, the escalation, "<Name> froze." and a reframe that ends on the
  punchline. A worker writes it from `script.md` with the game's design (title, track, the four rider classes);
  113-125 spoken words at the narrator's 4.1 words a second (a draft within 6 words of that range is kept). A draft that is out of range or opens any other way
  is rewritten up to twice, and the cell refuses a script that does not open with "In this world,".
- **Gate:** the cell stops at "Waiting for your go" before any voice credit is spent (`_shared/gate.ts`).
- **Narration:** the Voice cell's `premise` preset (the recipe's narrator, fx A, speed 1.15; the voice id lives
  in `harness.local.json` only), cached by text and voice.
- **Picture:** authored once in the recording place in Roblox Studio after the author's green flag (sets on the
  game's own track, the cast, the shot list). The project then holds `gen_shots.py` (the shot list, day or
  `--night`) and `project.json` (the assembly: picture, narration, captions, sounds, bed). Without those the cell
  ends after the narration and says so; it never stands in a fake video. With them:
  - **Lighting:** `params.lighting` ("day" or "night"), else "night" in the prompt ("make it night"), else day.
  - **Take:** `gen_shots.py` writes Shots.lua for the lighting. If `capture/take_<lighting>.json` holds the same
    Shots.lua hash, that take is reused; otherwise (or with `params.retake`) `capture.py` records one: it pushes
    the shots into the place whose name contains `params.place` (default "Global Set"), presses Play, records the
    viewport with the studio recorder, stops Play, cuts the set-change holds and measures the white slate. It needs
    Studio open in its full-screen layout on the portrait monitor and not in Play, and it fails on a bad take (no
    finished runner, no slate, too little picture).
  - **Assembly:** the studio assembler and limiter on `project_<lighting>.json` (the same narration and captions,
    so no voice credits); `premise.mp4` plus six stills. When the other lighting's reel exists, the same moment of
    both is attached as a before/after wipe.
- **Files:** `premise.mp4`, `narration.wav`, `premise.json` (project, lighting, the final's path, reused or recorded take).
