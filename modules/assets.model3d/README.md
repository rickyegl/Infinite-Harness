# assets.model3d

Makes a textured low-poly 3D model from a text prompt on the asset forge. The forge is a GPU runtime on Colab: a
FastAPI server reached through an SSH port forward on `127.0.0.1:8765`. The module answers `model3d` asset requests
from other modules; the game cells use it for the kart body, the four rider classes, the trackside landmarks and the
finish trophy.

- **Steps:** concept image, background removed, 3D shape, painted texture, low-poly reduce, game export. With
  `params.rig`, a skeleton and skin weights follow. Each forge step becomes a step of this cell with its preview
  image. Review gates are approved automatically.
- **Params:** `{ kind: "model3d", name?, size?, tris?, rig? }`.
  - `size` is the longest side in studs (default 8).
  - `tris` is the triangle budget (default 2000).
- **Files:** `model.glb` comes first (it is what `request()` delivers), then the OBJ set (`obj/model.obj`,
  `material.mtl`, `material_0.png`) and, when rigged, `model.fbx`.
- **Cache:** results are kept by prompt and params under `runs/.cache/model3d/<key>/`, with `done.json` when
  complete. A second build with the same design reuses them without the GPU. While a model is being made, a rerun
  picks up the forge job that is already making it instead of starting a new one.
- **Runtime:** `modules/_shared/colab.ts` attaches to a forge that already answers, or starts one with the forge's
  own launcher (`modules/_shared/forge.ps1`, which runs `launcher/colab-launcher.sh` in WSL from `paths.forge`).
  - A runtime this process started is stopped when the last caller releases it, unless `colab.keepAlive` is set.
  - `forge.ps1 -Action restart` uploads the forge code again and restarts its server on the running runtime.
    Colab allows one SSH connection per runtime, so close the port forward first and reopen it with
    `-Action tunnel` afterwards.
- **Timing:** one model takes about 7 minutes on an L4. Concept images and shapes run back to back, and the textures
  run one at a time, so a batch of eight takes 40 minutes or more. A cell gives up only when its forge job shows no
  change for 30 minutes (or after 4 hours in all), never just for waiting in the queue.
- **Dropped port forward:** the runtime and its jobs keep running when the local port forward drops (for example
  when the process that opened it ends). A cell that loses the forge reopens the forward
  (`forge.reconnect()`, one reconnect at a time per process) and keeps polling its job.
- **Out of memory:** the paint worker frees GPU memory after each texture and retries a texture that ran out of
  memory with fewer, smaller views; a worker that still runs out is restarted.
- **Secrets:** the forge's access token is read from the launcher log and only ever sent as the Authorization
  header. Nothing here prints or stores it.

Mock: `fixtures/default.jsonl`.
