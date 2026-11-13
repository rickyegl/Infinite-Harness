# 04. Asset modules and the handoff into the games

**Goal:** image, image edit, cutout, 3D model, video, voice and music exist as modules, and the game
orchestrators receive real assets from them through `request_asset`.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `plan/LOCAL.md`, then the READMEs of
`paths.forge` and `paths.studio`. Those projects already do the work; these modules are thin adapters.

## Build

| Module | Label | Wraps | Evidence |
|---|---|---|---|
| `assets.image` | Image | Image generation through the local proxy (the image-capable model id is in local config). Params: prompt, size, transparent. | candidates as `image`, chosen one as output |
| `assets.image.edit` | Image Edit | Same endpoint with the previous image as input ("make the walls red"). Keeps framing. | before and after |
| `assets.cutout` | Cutout | Forge background removal step; fallback: the image model's transparent output. | PNG on checkerboard |
| `assets.model3d` | 3D Model | Forge `mesh` pipeline over its REST API: concept, cutout, shape, texture, decimate, export, optional rig. Each forge step becomes a `node.step` with its preview image. Auto-approve review gates. | step previews, final `model3d` (GLB) |
| `assets.video` | Video | Image-to-video job on the Colab runtime (the author's existing notebook or launcher; path in local config). | `video` |
| `voice` | Voice | Studio narration tool with the cloned voice id from the studio's `.env`. Returns audio + word timings. | `audio` waveform |
| `music` | Music | Returns the chosen song, `video/makeasong.mp3` (or a longer version the author puts in `assets/music/`). No generation API is assumed. | `audio` |

1. Each module: `module.json`, `run.ts`, fixtures recorded from one real run, README with the exact commands it
   calls.
2. **Colab session helper** (`modules/_shared/colab.ts`): start or attach to the runtime using the forge's
   launcher, wait for health, open the port forward, and always stop the runtime in `finally` unless
   `colab.keepAlive` is set. One runtime is shared across modules in a run.
3. **Image chain memory.** `assets.image.edit` and `assets.cutout` default their input to the last image output
   in the same run, so "show me a house", "make the walls red", "transparent background" chain without paths.
4. **Importers for the games.**
   - Unity: `ImportAsset` (plan 03 helper) for GLB/FBX, PNG, audio; places a prefab where the caller asked.
   - Roblox: the forge's Roblox export (FBX in studs, texture) through Studio's importer path the Studio MCP
     exposes; images as decals; audio through a local test path or an approved upload.
   - Wire `request_asset` results into both engine orchestrators' prompts: "after an asset arrives, import it
     and replace the placeholder".
5. **Asset request batching.** The game orchestrator asks once for the shared art list; the bridge runs asset
   jobs in parallel where the backend allows (images) and serially where it does not (one GPU).
6. **Maker icons.** Every module in the table above is a non-LLM generator: set `maker` in its `module.json`
   (contract, "Maker icons"; the id for each is in `plan/LOCAL.md`). `music` takes the maker of the chosen
   song (named in `plan/LOCAL.md`). Check in the graph that each asset cell shows its badge.

## Verify first

- The proxy's image model: id, request shape, whether it supports image input for edits and transparent output.
  One live call each, saved as fixtures.
- Forge REST endpoints against the running server (`/api/system`, `/api/jobs`), and how long a mesh job takes
  end to end today. If over 8 minutes, the film uses one captured run and the game flow requests at most two
  models.
- The Colab image-to-video path the author already has: where it lives, how it is started, its model id. If it
  cannot be found, add a `USER-TODO` item and ship the module with its mock.
- Voice tool's command line and how it reports word timings.
- ASK the author before generating more than about three full narrations (credits).

## Done when

- `POST /runs {"prompt":"show me a house"}` returns a real image; the two follow-ups edit it and cut it out.
- A game run shows a request light leaving a game cell, an Assets cell producing image, cutout, mesh (and rig),
  the delivery light returning, and the model visible in both a Unity and a Roblox screenshot.
- `voice` returns audio in the cloned voice with word timings; `music` returns the chosen song.
- The Colab runtime is stopped at the end of the test session (check with the launcher's status command).
- Fixtures regenerated from the real runs; `HARNESS_MOCK=1 pnpm test` passes.

## Hand off

`plan/STATUS.md`: timings per module, which backends were live, credits used, anything left on mock.
