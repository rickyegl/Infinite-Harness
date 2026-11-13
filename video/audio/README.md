# Audio for the film

Audio files are not committed (see `.gitignore`). Put them here:

| File | What |
|---|---|
| `takes/<name>.wav` | Generated takes named in `../score/cues.json` (`takes/cand/` holds the other candidates). |
| `score.wav` | Built by `python video/tools/score.py`: the cues cut from the takes and joined on the grid, with effects. Listed under `music` in `../beats.json`. |
| `voice/S02.wav` ... | One recording per spoken shot, named by shot id, or `voice/take.wav` for a single take. |
| `voice/words.json` | Word timestamps, generated in plan 08. |
| `sfx/not_done.*` | The 1.5 s "I'm not done" effect (S27). |
| `reels/trailer.wav`, `reels/explainer.wav`, `reels/premise.wav` | The sound of the three reels shown in S24b, taken from plan 05's mp4s from their first frame (`ffmpeg -i reel.mp4 -vn reels/trailer.wav`). `score.py` plays one bar of each, at bars 38, 39 and 40, and skips any that are missing. |

The tempo is fixed in `../beats.json`.

The one committed exception is `../makeasong.mp3`: the chosen song's clip for S24 "Add music" (about 2 s),
mixed into `score.wav` at bar 36.
