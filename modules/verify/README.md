# verify

"Make no mistakes": the Verifier checks what every other cell of the run made, puts a check mark (or an alert)
on that cell, and sends one fix back to a cell whose work is broken, then checks it again.

- It waits until the cells it checks have finished (it reads the run's own `events.jsonl`), so the router can
  plan it beside them. It skips the root, the asset hub, itself and its children, other verifiers and the
  Recorder.
- **Checks**, per file a cell attached or published:
  - every file: it exists and is not empty;
  - images: not one flat colour, and the size the cell stated (or at least 64 px);
  - frames: every frame exists and the first is not blank;
  - video and audio: `ffprobe` finds a duration within 10% of the stated one, and an audio stream in a
    published video unless it is marked silent;
  - links: the address answers 200, and the page loads headless with no console errors and draws a picture;
  - the browser build: it loads from the bridge and draws;
  - the Roblox place: a 5 s play test in the open Studio place shows no script errors.
- **The fix:** a broken cell gets one `ask` with what is wrong (`node.request` to it). The cell runs again in
  place with its first input plus `params.fix`, and delivers back. The Verifier checks it again and marks it
  "Checked after the fix" or "Still failing after one fix".
- **Honest result:** the cell fails (`N of M cells still fail: ...`) when anything is still broken after the one
  fix. Checks that could not go deep are listed in a "Not checked in depth" step.
- **Shallow checks:**
  - the Roblox play test runs only when the harness place is open in Studio;
  - the browser build is checked only when the run made one;
  - link pages pass on a non-blank picture within about 60 s, not on gameplay;
  - documents are checked for presence only.
- Test: `apps/bridge/test/verify.test.ts` (delete a file, one fix, re-check; a pass; an honest failure).
