# voice

Reads a short script aloud in the author's cloned voice, with a timing for every word.

- **Command:** the video studio's own tool, from `paths.studio`:
  ```
  python <studio>/shared/tools/tts_narration.py script.txt <out> --fx none
  ```
  - The tool reads the voice key and the cloned voice id from the studio's `.env` itself; this module never touches
    them.
  - `--fx none` keeps the voice as recorded. The tool's default is a 1.5x pitched take made for Shorts.
  - Its outputs are `narration.wav` (44.1 kHz mono) and `words.json`, `[{ w, start, end, emph, beat }]`, one beat per
    script line. `ffmpeg` and `ffprobe` are found next to `paths.ffmpeg`.
- **Credits:** one request reads one short script of at most 600 characters. Results are cached by script text under
  `runs/.cache/voice/`, so the same script never costs credits twice. Ask the author before reading more than one
  short script in a session.
- **Evidence:** the audio with `meta.words` (word, start, end) for captions.
- **Files:** `narration.wav` first, which is what `request()` delivers, then `words.json`.

Mock: `fixtures/default.jsonl`, recorded from a real run.
