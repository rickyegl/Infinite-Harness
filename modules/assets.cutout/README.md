# assets.cutout

Removes a picture's background on the asset forge, the Colab GPU runtime described in `modules/assets.model3d` and
`modules/_shared/colab.ts`. It returns an RGBA PNG at the picture's own size.

- **Calls:**
  1. `POST /api/uploads` with the picture's bytes, which returns `{ path, width, height }`.
  2. `POST /api/jobs`:
     ```json
     { "pipeline": "image", "prompts": ["cutout"], "image": "<path>", "review": false,
       "params": { "finalize": { "trim": false, "square": false, "size": "<longest side>" } } }
     ```
     The upload stands in for the generate step, so the forge runs only "Remove background" and "Finalize".
  3. `GET /api/jobs/<id>` until it is done, then `GET /files/<finalize output>`.
- **Input:** the first image in `refs`, else the last picture of the run (image chain memory, see
  `assets.image.edit`).
- **No fallback:** the image model has no real transparent output (asked for one, it paints a checkerboard). Without
  the forge, this cell fails and says why.
- **Cache:** results are kept by the picture's bytes under `runs/.cache/cutout/`. A second cutout of the same
  picture skips the GPU.
- **Runtime:** the forge is started or attached by `forgeSession()`. A runtime this process started is stopped
  90 s after its last user, unless `colab.keepAlive` is set.
- **Evidence:** "Before", then "Background removed" with `checker: true`, so the site draws it on a checkerboard.

Mock: `fixtures/default.jsonl`, recorded from a real run.
