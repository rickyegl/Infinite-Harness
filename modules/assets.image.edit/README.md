# assets.image.edit

Changes a picture as asked ("make the walls red") and keeps its framing. It uses the same proxy call as Image
(`modules/_shared/image.ts`), with the input picture sent as an `image_url` data URL before the instruction. The
instruction gets "change only that: keep everything else, the framing and the camera exactly as they are".

- **Input:** the first image in `refs` (a planned cell's input, or `request_asset` refs). Otherwise it uses the last
  `image` output of an Image, Image Edit or Cutout cell in this run, read from `runs/<id>/events.jsonl` (image chain
  memory). This is how "show me a house", "make the walls red" and "transparent background" chain without paths.
- **Evidence:** "Before", then "After" with `reveal: "wipe"` over the before picture.
- **Files:** `image.jpg` (or `.png`) first. The edit came back at the same size as its input (1408 x 768) in the
  live runs.
- **Timing:** about 8-10 s.

Mock: `fixtures/default.jsonl`, recorded from a real run.
