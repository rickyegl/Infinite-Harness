# voice

Reads exact words aloud, with a timing for every word. The author's cloned voice by default; a reel asks for its
own studio narrator with `params.preset`.

- **Command:** the video studio's own tool, from `paths.studio`:
  ```
  python <studio>/shared/tools/tts_narration.py script.txt <out> --fx <fx> [--voice <id> --model <model> --speed <s>]
  ```
  - The tool reads the voice key (and, without `--voice`, the cloned voice id) from the studio's `.env` itself;
    this module never touches them.
  - Its outputs are `narration.wav` (44.1 kHz mono) and `words.json`, `[{ w, start, end, emph, beat }]`, one beat per
    script line. `ffmpeg` and `ffprobe` are found next to `paths.ffmpeg`.
- **Voices:** no preset = the cloned voice, `--fx none` (as recorded). `params.preset` picks
  `voice.presets.<name>` from `harness.local.json` (`{ voice, model?, fx, speed?, maxChars? }`; the example config
  has placeholders, ids never go in committed files):
  - `premise`: the premise recipe's narrator, `--fx A --speed 1.15` (`premise/howto/script.md` §4).
  - `explainer`: the explainer recipe's narrator on its own model, `--fx none`, normal speed
    (`explainers/howto/script.md` §4).
- **Params:** `preset`, `verbatim` (keep the prompt as is: a reel's script, one beat per line, `*stars*` for
  caption keywords).
- **Credits:** one request reads one script of at most 600 characters (or the preset's `maxChars`). Results are
  cached by script text and voice under `runs/.cache/voice/`, so the same script never costs credits twice. The
  reels voice a script only after the author's go (see `modules/approve`).
- **Evidence:** the audio with `meta.words` (word, start, end) for captions.
- **Files:** `narration.wav` first, which is what `request()` delivers, then `words.json`.

Mock: `fixtures/default.jsonl`, recorded from a real run (cloned voice).
