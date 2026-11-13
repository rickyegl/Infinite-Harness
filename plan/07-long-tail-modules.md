# 07. Long-tail modules (Act 5)

**Goal:** every prompt in Act 5 of the film maps to a module that really ran at least once. These are thin
adapters. Budget: about 45 minutes each. If one fights back, keep its mock, write why in `STATUS.md`, move on.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`, `plan/LOCAL.md`, and
[video/SHOTS.md](../video/SHOTS.md) shots S28-S42 (the evidence each shot needs is the spec).

## Build

| Module | Label | Shot | How | Evidence the shot needs |
|---|---|---|---|---|
| `drafting` | Drafting | S31 | Agent writes a Python `ezdxf` script for a floor plan of the house image (rooms, doors, dimensions); export DXF, plus an ordered list of entities for the line-by-line draw. DWG conversion only if a converter is already installed. | `doc` with entity list (drawn progressively by the UI) |
| `blender` | 3D | S32, S41 | cli-agent with the Blender MCP server (already configured for one worker). Builds the house from the plan; later imports the game's kart model and places it on the roof. Screenshot after every build step. | `frames` of viewport screenshots |
| `blender.render` | Render | S33 | Same scene, Cycles/EEVEE still, fixed camera. Headless `blender -b` is fine. | `image`, plus 3-4 progressive samples if cheap |
| `assets.video` | Video | S34 | From plan 04, fed the render. | `video` |
| `study` | Study | S35 | cli-agent with the course MCP server: list courses, find slide decks and upcoming tests, write one study guide per test as Markdown -> PDF. Read-only on the course site. | deck thumbnails, then one `doc` per guide (the wall of guides) |
| `cad` | CAD | S36 | cli-agent with the SurfaceCAD remote MCP (`https://surfacecad.com/mcp`, author signs in once). Builds the drum-shooter prototype part by part, capturing an image after each part; exports STEP. | ordered `frames` (one per part), STEP as output |
| `sim` | Sim | S37 | No module work: the author supplies the simulator clip. Provide `modules/sim` as a pass-through that attaches a supplied video so the shot has a take. | `video` |
| `pcb` | PCB | S38 | Code-to-board tool that runs from the command line without a desktop EDA install (verify which; candidates are in local notes). Agent writes the board file; export layout SVG/PNG and a 3D view. Board choice: author. | layout image (traces drawn progressively if the format allows), 3D view |
| `forecast` | Forecast | S39 | Time-series foundation model (named in local notes) on a demand series (dataset: author's choice; default a public retail demand CSV in `modules/forecast/data/`). Runs on the local GPU or CPU; Colab only if needed. | `chart` JSON: history, forecast, quantile band |
| `anomaly` | Anomaly | S40 | Same model: residuals between one-step forecasts and actuals, flagged beyond the quantile band. Reuses the forecast chart. | `chart` JSON with markers |
| `game` follow-up | Game | S42 | "Put the house on the game": the Blender export goes through `ImportAsset` into the Unity project next to the track. | gameplay `video` |

1. One real run per module, saved as its fixture, then moved on.
2. Chain memory (extends plan 04): within a run, "it"/"the house"/"the car" resolve to the latest matching
   output, so the Act 5 prompts work as one conversation in one run.
3. Router table tests: add every Act 5 prompt with its expected module.
4. The `chart` evidence format is plain JSON (`{history: [[t,v]], forecast: [[t,v]], band: [[t,lo,hi]],
   anomalies: [t]}`) so the UI draws it natively and it animates with the clock.
5. `forecast` and `anomaly` set `maker` in their `module.json` (contract, "Maker icons"; id in
   `plan/LOCAL.md`). The other rows are agents or non-AI tools and set none; `assets.video` has its own.

## Verify first

- SurfaceCAD: the remote MCP connects from the worker CLI after sign-in, its real tool names, how to get a
  picture of the model after each feature, export formats. Free-plan limits (credits per part).
- Blender MCP server starts against Blender 5.x and can take viewport screenshots.
- Course MCP: tool names for courses, files, assignments; it must stay read-only (no submissions, no messages).
- The forecast model: package name, checkpoint id, context and horizon limits, whether it fits on a 12 GB GPU or runs
  acceptably on CPU. Record in local config.
- PCB tool: installs and renders headlessly here.
- If the author already has a working script for any row, use it: ask for its path via `USER-TODO` rather than
  rebuilding.

## Done when

- In one run, these prompts in order each light the right module and produce their evidence: show me a house /
  make the walls red / transparent background / design the house / build it on Blender / render it / make it a
  video / check all presentations and make a study guide for every test / CAD a drum shooter FRC robot
  prototype / make a [board] PCB / forecast demand / detect anomaly / put the car on the house / put the house
  on the game.
- Each module has a fixture from a real run, or an honest "mock only, because ..." line in `STATUS.md`.
- No course data, names or grades are committed: study fixtures use a redacted or synthetic course.

## Hand off

`plan/STATUS.md`: per module: real or mock, run id, time taken, credits used.
