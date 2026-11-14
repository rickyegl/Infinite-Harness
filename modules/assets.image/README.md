# assets.image

Makes a new picture from a text prompt with the image model behind the local model proxy. It also answers
`image` asset requests from other modules; for example, the game's banner art comes from here.

- **Call:** `POST <proxy.baseUrl>/chat/completions` with `model: <proxy.imageModel>` and the prompt as the user
  message. With `size`, the body also carries `image_config: { aspect_ratio }`. The picture comes back as a data URL
  in `choices[0].message.images[0].image_url.url`, a JPEG of about 1408 x 768 by default or 1024 x 1024 at `1:1`.
  The shared code is in `modules/_shared/image.ts`. The model id is set only in `harness.local.json`.
- **Params:** `{ kind?: "image", name?, size?, count?, transparent? }`.
  - `size` is `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` or `21:9`. The words `square`, `wide` and `tall` also
    work. Without `size`, the model picks its default (landscape).
  - `count` sets how many candidates are made at once (1-4). The default is 2 for a direct prompt and 1 for an asset
    request (one that names the piece). All candidates become evidence, and candidate 1 is the output.
  - `transparent: true` draws the subject on a plain white background, and a child Cutout cell removes it. The model
    has no real transparent output: asked for one, it paints a checkerboard.
- **Files:** `image.jpg` (or `.png`) first, which is what `request()` delivers. The cell also emits it as its
  `image` output, which is how Image Edit and Cutout find it later in the run (image chain memory).
- **Timing:** about 8 s per call. Busy answers (429/5xx) are retried up to three times.

Mock: `fixtures/default.jsonl`, recorded from a real run (`pnpm fixture <runId> <nodeId> assets.image`).
