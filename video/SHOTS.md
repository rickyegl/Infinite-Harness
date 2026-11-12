# Demo film: shot layout

The 3-minute film is designed first; the app is built to produce these shots. Every screen in the product exists
because a shot needs it.

- **Source of truth:** [shots.json](shots.json). Positions are **bars and beats**, never seconds.
- **Timing:** [beats.json](beats.json) holds the music grid. It is a placeholder (128 BPM) until the real beat
  timings arrive. After changing either file run `node video/tools/resolve.mjs`: it writes `timeline.json`
  (seconds per shot), regenerates the table below and fails loudly if the film no longer adds up to 3:00 or a
  voice line is too fast to say.
- **Format:** 1920x1080, 60 fps, 180 s. Vertical reels appear *inside* the frame as deliverables.

## Look

Near-black stage, one accent colour, thin luminous lines, large quiet type. It should feel like a hardware reveal
film: hard cuts on beats, flashes on drops, the camera always travelling. No chat bubbles anywhere. No provider
or model names anywhere: cells are named by what they do (Game, Image, Voice, CAD).

## The eight views (this is the app's whole UI)

| View | What it is | Used in |
|---|---|---|
| `prompt` | One clean text box, centered, nothing else. Spoken words land in it; each understood intent leaves as a chip. | Acts 1, 4 |
| `graph` | Free tree-like graph. Root in the middle, module cells around it. A sub-orchestrator is a cell that contains its own tree, drawn with the same grammar. Requests between cells are travelling lights on edges. | Act 2 |
| `focus` | The camera zooms into a cell until the cell is the screen: step ticker (left), evidence stage (center), facts (right). | Act 2 |
| `split` | Two evidence stages side by side, mini-graph inset in a corner showing which cell just fired. | Acts 2, 3 |
| `wall` | Finished outputs as tiles with their links. | Act 3 |
| `banner` | Module name large on top, the prompt typed under it, evidence full-bleed, earlier steps as a breadcrumb strip. | Act 5 |
| `rain` | Graph far away and dim, prompts swiping through the text box, no evidence. | Act 6 |
| `title` | Wordmark on black. | Acts 3, 7 |

Live use and the film share these views. In live use the clock is real time and events come from the computer; in
the film the clock is the beat grid and events come from recorded runs.

## Acts

| Act | Bars | What happens |
|---|---|---|
| 1. The ask | 1-12 | One spoken prompt. Each phrase becomes a chip. "Make no mistakes." Enter on the drop. |
| 2. Orchestration | 13-36 | The graph blooms. Zoom into the game orchestrator and its two engine sub-orchestrators, an asset handoff across the tree, trailer, campaign, hosting, verification, gameplay. |
| 3. Direct it | 37-50 | Four spoken changes, each instant on a downbeat: night, crossplay, realistic, music. Deliverables wall. Fake ending. |
| 4. "I'm not done." | 51 | 1.5 s sound effect. The text box slams back. |
| 5. Everything | 52-81 | Rapid prompts, module name on top: image, edit, cutout, drafting, 3D, render, video, study guides, CAD, sim, PCB, forecast, anomaly, then the car on the house and the house in the game. |
| 6. Anything | 82-90 | Slow zoom out, evidence stops, prompts swipe in faster and faster. "everything..." "and anything..." |
| 7. Title | 91-96 | Infinite Harness. Built with AI. |

## Shot table

Generated from `shots.json` by `video/tools/resolve.mjs`. Do not edit between the markers.

<!-- shots:start -->
| Shot | Bars | Time | View | Module | Voice line | On screen | Camera / FX | Source | Take |
|---|---|---|---|---|---|---|---|---|---|
| S01 | 1-2 | 0:00.0-0:03.8 | prompt |  |  | Black. The text box fades up alone in the center, cursor blinking on the beat. | Locked, slow 2% push in. Reverse riser into bar 3. | ui (elastic) |  |
| S02 | 3-4 | 0:03.8-0:07.5 | prompt |  | "Make a racing game where humanoids fight while racing..." | Words land in the box as they are spoken. A 'Game' chip slides out under the box. | Locked. Chip pops on the bar-4 downbeat. | ui | main |
| S03 | 5 | 0:07.5-0:09.4 | prompt |  | "...on Unity. And Roblox." | The Game chip splits in two: 'Unity' on beat 2, 'Roblox' on beat 4. | Locked. Two snare-synced pops. | ui | main |
| S04 | 6 | 0:09.4-0:11.3 | prompt |  | "Also make a game trailer." | 'Trailer' chip. | Locked. | ui | main |
| S05 | 7-8 | 0:11.3-0:15.0 | prompt |  | "Make an ad campaign for Unity and Roblox players, using a clone of my voice." | 'Campaign' chip with three mini chips (Explainer, Reel, Image). 'Voice' chip draws a live waveform of the line being spoken. | Locked. Waveform is the real voice track. | ui | main |
| S06 | 9 | 0:15.0-0:16.9 | prompt |  | "Host the game on browser." | 'Host' chip with a globe tick. | Locked. | ui | main |
| S07 | 10 | 0:16.9-0:18.8 | prompt |  | "Show the process on a video." | 'Recorder' chip with a red record dot that starts blinking and keeps blinking for the rest of the film. | Locked. | ui | main |
| S08 | 11-12 | 0:18.8-0:22.5 | prompt |  | "Make no mistakes." | A thin 'Verifier' ring closes around every chip. Beat of silence. Enter key press exactly on the next downbeat. | Locked, then 1-frame punch on Enter. Music drops out for the last 2 beats. | ui | main |
| S09 | 13-14 | 0:22.5-0:26.3 | graph |  |  | DROP. The box collapses into a thin bar at the top and becomes the root cell. First ring fans out: Game, Trailer, Campaign, Voice, Host, Recorder, Verifier. | Wide, drifting. White flash + shake on beat 1. One cell lands per beat. | replay | main |
| S10 | 15-16 | 0:26.3-0:30.0 | graph |  |  | Game cell opens as a sub-orchestrator: Design, then a Unity orchestrator and a Roblox orchestrator, each sprouting its own subtree (Track, Karts, Combat, Humanoids, UI, Build). | Push into the Game cell; the subtree fills the frame. Edges draw with travelling light. | replay | main |
| S11 | 17-18 | 0:30.0-0:33.8 | focus |  |  | Unity > Karts cell. Step ticker advances, editor viewport frames stream in (kart on track), a code diff glints past. | Zoom into the cell until it is the screen. Step ticks on 8th notes. | replay | main |
| S12 | 19-20 | 0:33.8-0:37.5 | focus |  |  | Roblox > Combat cell. Studio viewport frames: humanoids swinging at each other from karts. | Whip-pan across the graph from the Unity subtree to the Roblox subtree. Motion blur on the pan. | replay | main |
| S13 | 21-22 | 0:37.5-0:41.3 | graph |  |  | Asset handoff. The Unity orchestrator emits a request ('kart + driver models'); a bright edge shoots across the graph to the Assets cell. Inside it: concept image, cutout, mesh, rig, one thumbnail per beat. | Follow the request along the edge. Thumbnails pop on beats 1-4 of bar 22. | replay | main |
| S14 | 23-24 | 0:41.3-0:45.0 | split |  |  | The asset packet travels back and lands in both engines: the same model appears in the Unity viewport and the Roblox viewport. | Pull back to a split stage. Both viewports flash on arrival. | replay | main |
| S15 | 25-26 | 0:45.0-0:48.8 | focus |  |  | Trailer cell. Gameplay strip, beat grid, cuts snapping onto beats; one second of the finished trailer plays in the stage. | Zoom into the Trailer cell. Cut markers snap in time with the music. | replay | main |
| S16 | 27-28 | 0:48.8-0:52.5 | focus |  |  | Campaign cell and its subtree: Explainer reel, Premise reel, Ad image. The Voice cell draws the cloned-voice waveform. Three vertical reel frames stand up side by side. | Slide from Trailer to Campaign. | replay | main |
| S17 | 29-30 | 0:52.5-0:56.3 | focus |  |  | Host cell. Browser build bar fills, a tunnel line connects to a globe, the public URL types out, a browser frame loads the game. | Zoom into the Host cell. URL lands on the bar-30 downbeat. | replay | main |
| S18 | 31-32 | 0:56.3-1:00.0 | graph |  |  | Recorder cell shows the graph being recorded (picture in picture, one level of recursion). Then the Verifier: check marks cascade across every cell. | Pull back to wide. One check per 8th note. | replay | main |
| S19 | 33-34 | 1:00.0-1:03.8 | split |  |  | Whole tree is green. Two game windows rise out of the graph: the browser build and the Roblox game, both running. | Wide, windows scale up from their cells. | replay (elastic) | main |
| S20 | 35-36 | 1:03.8-1:07.5 | split |  |  | Full-bleed split gameplay: humanoids fighting while racing, Unity left, Roblox right. | Locked. Hard cuts on every beat inside each half. | clip (elastic) | main |
| S21 | 37-38 | 1:07.5-1:11.3 | split |  | "Make it night." | Roblox premise ad (vertical) with the game behind it. Flips from day to night on the bar-38 downbeat. A 'Lighting' cell flashes in the mini-graph. | Locked. Day-to-night as a single-frame match cut. | replay | night |
| S22 | 39-40 | 1:11.3-1:15.0 | split |  | "Add crossplay." | Roblox and Unity windows side by side. A Roblox racer appears in the Unity window and a Unity racer in the Roblox window. 'Relay' cell flashes. | Locked. A line links the two windows on the downbeat. | replay | crossplay |
| S23 | 41-42 | 1:15.0-1:18.8 | split |  | "Make it realistic." | Unity window wipes left to right into the upgraded look: post-processing, reflections, lighting. 'Shaders' cell flashes. | Slow push on the Unity window. Wipe lasts exactly 2 beats. | replay | realistic |
| S24 | 43-44 | 1:18.8-1:22.5 | split |  | "Add music." | 'Music' cell flashes. The chosen song plays for 4 seconds with its waveform across the bottom while gameplay continues. | Locked. Demo track ducks under the 4 s song clip, then slams back. | replay | music |
| S25 | 45-47 | 1:22.5-1:28.1 | wall |  |  | Deliverables wall assembles instantly: Play-in-browser link, Roblox link, trailer (2 s), three reels (1 s each), ad image. | Slow drift across the wall. One tile per beat. | replay | main |
| S26 | 48-50 | 1:28.1-1:33.8 | title |  |  | Fake ending. The wall dims, a small wordmark fades up, the music resolves and tails into silence. | Locked. Fade toward black. Silence on the last 2 beats. | ui (elastic) |  |
| S27 | 51 | 1:33.8-1:35.6 | prompt |  | "I'm not done." | The wordmark glitches and rewinds. The text box slams back to center. | Punch in. Author's 1.5 s sound effect. Music returns harder on the next downbeat. | ui |  |
| S28 | 52-53 | 1:35.6-1:39.4 | banner | IMAGE | "Show me a house." | Generated house image resolves full-bleed. | Locked. | replay | house.image |
| S29 | 54 | 1:39.4-1:41.3 | banner | IMAGE EDIT | "Make the walls red." | Same house, same framing, walls red. | Locked. Match cut on the downbeat. | replay | house.red |
| S30 | 55 | 1:41.3-1:43.1 | banner | CUTOUT | "Transparent background." | Background drops away; the dimmed graph shows through behind the house. | Locked. | replay | house.cutout |
| S31 | 56-57 | 1:43.1-1:46.9 | banner | DRAFTING | "Design the house." | Floor plan drawing: walls, doors and dimensions draw line by line. | Slow push. Lines draw to the hi-hat. | replay | house.plan |
| S32 | 58-59 | 1:46.9-1:50.6 | banner | 3D | "Build it on Blender." | Blender viewport screenshots: the house rising from the plan. | Locked. One build step per beat. | replay | house.blender |
| S33 | 60 | 1:50.6-1:52.5 | banner | RENDER | "Render it." | Realistic render resolves from noise. | Locked. | replay | house.render |
| S34 | 61-62 | 1:52.5-1:56.3 | banner | VIDEO | "Make it a video." | The render comes alive as a short clip. | Locked. | clip | house.video |
| S35 | 63-66 | 1:56.3-2:03.8 | banner | STUDY | "Check all presentations on Canvas and make a study guide for every... single... test." | Course decks fan out. On 'every', 'single', 'test': one guide, a row of guides, a wall of guides. | Pull back one step on each of the three words. Three hits on three consecutive downbeats. | replay | study |
| S36 | 67-68 | 2:03.8-2:07.5 | banner | CAD | "CAD a drum shooter FRC robot prototype." | SurfaceCAD assembly builds piece by piece: frame, drum, flywheel, hood. | Slow orbit. One part per beat. | replay | cad |
| S37 | 69-70 | 2:07.5-2:11.3 | banner | SIM |  | The robot shooting inside the FRC simulator. | As supplied. | supplied | cad.sim |
| S38 | 71-72 | 2:11.3-2:15.0 | banner | PCB | "Make a [board to be decided] PCB." | Board layout: traces route themselves, then the board flips to a 3D view. | Locked, flip on bar 72. | replay | pcb |
| S39 | 73-74 | 2:15.0-2:18.8 | banner | FORECAST | "Forecast demand." | History line draws, then the forecast and its band extend to the right. | Locked. | replay | forecast |
| S40 | 75 | 2:18.8-2:20.6 | banner | ANOMALY | "Detect anomaly." | Same chart: red markers snap onto the outliers. | Locked. Markers on beats. | replay | anomaly |
| S41 | 76-77 | 2:20.6-2:24.4 | banner | 3D | "Put the car on the house." | The kart from the game lands on the roof of the house in Blender. | Locked. Impact on the bar-77 downbeat. | replay | car.house |
| S42 | 78-81 | 2:24.4-2:31.9 | banner | GAME | "Put the house on the game." | The house, kart still on its roof, stands beside the Unity track as racers fight past it. | Hold, then begin a very slow zoom out. | clip (elastic) | house.game |
| S43 | 82-85 | 2:31.9-2:39.4 | rain |  |  | Slow zoom out. The graph now holds every cell from the film. Evidence fades. Prompts swipe through the text box, one per beat. | Continuous zoom out. | ui (elastic) |  |
| S44 | 86-88 | 2:39.4-2:45.0 | rain |  |  | Prompts every half beat. Title word above: 'everything...' | Continuous zoom out. | ui |  |
| S45 | 89-90 | 2:45.0-2:48.8 | rain |  |  | Prompts every quarter beat, blurring. Title: 'and anything...' | Continuous zoom out. Riser to the title hit. | ui |  |
| S46 | 91-94 | 2:48.8-2:56.3 | title |  |  | Every cell implodes into the wordmark: Infinite Harness. | Locked. Big hit on the downbeat. | ui (elastic) |  |
| S47 | 95-96 | 2:56.3-3:00.0 | title |  |  | 'Built with AI' under the wordmark. Cut to black on the last beat. | Locked. Final hit. | ui |  |
<!-- shots:end -->

`Source`: **ui** = interface animation only, **replay** = a real recorded run replayed on the beat clock,
**clip** = a video a real run produced, **supplied** = footage the author provides. `Take` names the recorded
run a shot reads from (`video/takes/<take>/events.jsonl`). *Elastic* shots absorb bars when the real track is
longer or shorter than 96 bars.

## What the author supplies

| Item | Where | Needed by |
|---|---|---|
| Music track | `video/audio/music.*` | Assembly |
| Beat timings | `video/beats.json` | Before capture |
| Voice lines (one recording per line, or one take) | `video/audio/voice/` | Assembly; word timings drive the typing in the text box |
| "I'm not done" sound effect (1.5 s) | `video/audio/sfx/not_done.*` | S27 |
| 4 s of the chosen song | `video/audio/song4s.*` | S24 |
| FRC simulator clip of the CAD robot | `video/takes/cad.sim/` | S37 |
| Which PCB, which company's demand data | `shots.json` S38-S40 | Take capture |

## Budget notes

- Act 1 carries 47 spoken words in about 17 s. The longest line (S05, 15 words in 2 bars) is the tightest in the
  film; if it does not fit when recorded, give S05 a third bar and take it from S01.
- Act 5 gives every prompt 1 or 2 bars except the study-guide line (4 bars, three hits) and CAD plus sim (4 bars).
- If the real track is not 96 bars at this tempo, `resolve.mjs` says how many seconds to add or remove and lists
  the elastic shots.
