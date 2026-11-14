# campaign

An ad campaign for the run's game, one brief per audience (Unity players, Roblox players).

- **Briefs:** a worker writes `briefs.json` (an angle, a headline and a call to action per audience); anything it
  misses gets a plain default (`briefsOf`).
- **Pieces, side by side under the Campaign node:** the Explainer reel, the Premise reel (Roblox), one Ad Image
  per audience and the Trailer cut (Unity gameplay). Each reel waits for the author's go on its script before its
  narration, in its own recipe's voice.
- **Publish:** a dry-run plan over every reel that came out. Nothing is posted.
- A piece that cannot finish (no trailer track yet, a stopped reel) is named in the summary; the rest still
  lands. `params.pieces` and `params.audiences` narrow the set.
- **Files:** everything the pieces made; `briefs.json`, `campaign.json`.
