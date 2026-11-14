# reel.explainer

A vertical explainer Short about the run's Unity game, made with the studio's explainer recipe
(`explainers/HOW_TO.md`): about 24 s, 9:16, in the explainer narrator's voice. It explains the game to a player
(premise, track, fight, rider classes, how to win, where to play) and never how the game was made.

- **Script:** a worker writes `script.txt` in the studio project (`explainers/projects/<Title>_Explainer_<run>`)
  from `script.md` and the game's facts (`gameFacts` in `run.ts`, from the run's design and Unity build): hook,
  setup, escalation, reveal, proof, payoff. The word count follows the
  narrator's pace (2.7 words a second); a draft out of range is rewritten up to twice.
- **Gate:** the cell stops at "Waiting for your go" (`_shared/gate.ts`). The author may edit `script.txt` first,
  then says go (the Approve cell). No voice credit is spent before that. A script already voiced in this voice is
  not gated again.
- **Narration:** the Voice cell's `explainer` preset (its own voice id and model live in `harness.local.json`
  only), cached by text and voice.
- **Picture:** a HyperFrames composition in the game's own colours, written by a worker from `visuals.md`, checked and fixed up to twice,
  rendered offline; then the studio's cue, sound-effect, caption, bed and assembly tools, limited to the recipe's
  loudness.
- **Evidence:** the script page, the waveform, a storyboard of the composition, the video.
- **Files:** `explainer.mp4`; `reel.json` for the Publish dry run.
