# Audio for the film

Audio files are not committed (see `.gitignore`). Put them here:

| File | What |
|---|---|
| `cues/01.wav` ... | The music cues listed in `../SHOTS.md`, each cut to whole bars at 128 BPM. |
| `score.wav` | The cues joined on the grid; list it under `music` in `../beats.json`. |
| `voice/S02.wav` ... | One recording per spoken shot, named by shot id, or `voice/take.wav` for a single take. |
| `voice/words.json` | Word timestamps, generated in plan 08. |
| `sfx/not_done.*` | The 1.5 s "I'm not done" effect (S27). |
| `song4s.*` | Four seconds of the chosen song (S24). |

The tempo is fixed in `../beats.json`.
