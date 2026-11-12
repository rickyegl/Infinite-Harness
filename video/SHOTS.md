# Demo film: shot layout

The 3-minute film is designed first; the app is built to produce these shots. Every screen in the product exists
because a shot needs it.

- **Source of truth:** [shots.json](shots.json). Positions are **bars and beats**, never seconds.
- **Timing:** [beats.json](beats.json) holds the music grid. Acts 1-4 are timed to **Track A**, measured from
  the audio (127.4 BPM, first beat at 0.108 s). Acts 5-7 continue at that tempo as a placeholder until
  **Track B** is chosen. After changing either file run `node video/tools/resolve.mjs`: it writes `timeline.json`
  (seconds per shot), regenerates the table below and fails loudly if the film no longer adds up to 3:00 or a
  voice line is too fast to say.
- **Preview:** `node video/tools/preview.mjs` renders a text-card animatic with the music
  (`video/renders/shots-preview.mp4`).
- **Format:** 1920x1080, 60 fps, about 180 s (179.1 s on the current grid). Vertical reels appear *inside* the frame as deliverables.

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
| 1. The ask | 1-17 | One spoken prompt. Each phrase becomes a chip. "Make no mistakes." Enter on the drop. |
| 2. Orchestration | 18-37 | The graph blooms. Zoom into the game orchestrator and its two engine sub-orchestrators, an asset handoff across the tree, trailer, campaign, hosting, verification, gameplay. |
| 3. Direct it | 38-49 | Four spoken changes, each instant on a downbeat: night, crossplay, realistic, music. Deliverables wall. Fake ending. |
| 4. "I'm not done." | 50 | 1.5 s sound effect. The text box slams back. |
| 5. Everything | 51-80 | Rapid prompts, module name on top: image, edit, cutout, drafting, 3D, render, video, study guides, CAD, sim, PCB, forecast, anomaly, then the car on the house and the house in the game. |
| 6. Anything | 81-89 | Slow zoom out, evidence stops, prompts swipe in faster and faster. "everything..." "and anything..." |
| 7. Title | 90-95 | Infinite Harness. Built with AI. |

### How the acts sit on Track A

| Track A section | Film bars | Time | What the film does with it |
|---|---|---|---|
| Pickup | 1 | 0:00 | Black. |
| Sparse intro, 8 bars (big impact on bar 6) | 2-9 | 0:02 | The prompt is spoken; "Roblox" lands on the impact. |
| Build, 8 bars, one beat of silence at the end | 10-17 | 0:17 | Rest of the prompt. "Make no mistakes." Silence. |
| Drop, 16 bars (big hit on bar 26) | 18-33 | 0:32 | Enter. The graph blooms; the asset handoff fires on the hit. |
| Breakdown, 4 bars | 34-37 | 1:02 | Verifier checks, tree goes green, first gameplay. |
| Second drop, 8 bars | 38-45 | 1:10 | "Make it night", crossplay, realistic, music: two bars each. |
| Resolve, 4 bars, then a bass tail | 46-49 | 1:25 | Deliverables wall, fake ending. |
| (tail) | 50 | 1:32 | "I'm not done." |

## Shot table

Generated from `shots.json` by `video/tools/resolve.mjs`. Do not edit between the markers.

<!-- shots:start -->
| Shot | Bars | Time | View | Module | Voice line | On screen | Camera / FX | Source | Take |
|---|---|---|---|---|---|---|---|---|---|
| S01 | 1-2 | 0:00.0-0:03.9 | prompt |  |  | Black for the pickup bar. The text box appears alone in the center on the first hit (bar 2), cursor blinking on the beat. | Locked, slow 2% push in. Track A's sparse intro. | ui (elastic) |  |
| S02 | 3-4 | 0:03.9-0:07.6 | prompt |  | "Make a racing game where humanoids fight while racing..." | Words land in the box as they are spoken. A 'Game' chip slides out under the box. | Locked. Chip pops on the bar-4 downbeat. | ui | main |
| S03 | 5-6 | 0:07.6-0:11.4 | prompt |  | "...on Unity. And Roblox." | The Game chip splits in two: 'Unity' in bar 5, 'Roblox' on the bar-6 downbeat. | Locked. The intro's big impact is on bar 6: 'Roblox' lands on it. | ui | main |
| S04 | 7 | 0:11.4-0:13.3 | prompt |  | "Also make a game trailer." | 'Trailer' chip. | Locked. | ui | main |
| S05 | 8-10 | 0:13.3-0:18.9 | prompt |  | "Make an ad campaign for Unity and Roblox players, using a clone of my voice." | 'Campaign' chip with three mini chips (Explainer, Reel, Image). 'Voice' chip draws a live waveform of the line being spoken. | Locked. Waveform is the real voice track. The build starts on bar 10 as the Voice chip appears. | ui | main |
| S06 | 11-12 | 0:18.9-0:22.7 | prompt |  | "Host the game on browser." | 'Host' chip with a globe tick. | Locked. | ui | main |
| S07 | 13-14 | 0:22.7-0:26.5 | prompt |  | "Show the process on a video." | 'Recorder' chip with a red record dot that starts blinking and keeps blinking for the rest of the film. | Locked. | ui | main |
| S08 | 15-17 | 0:26.5-0:32.1 | prompt |  | "Make no mistakes." | A thin 'Verifier' ring closes around every chip. Beat of silence. Enter key press exactly on the next downbeat. | Locked, then 1-frame punch on Enter. Line spoken in bar 15; bars 16-17 are the top of the build. The track's own one-beat silence is the last beat of bar 17. | ui | main |
| S09 | 18-19 | 0:32.1-0:35.9 | graph |  |  | DROP. The box collapses into a thin bar at the top and becomes the root cell. First ring fans out: Game, Trailer, Campaign, Voice, Host, Recorder, Verifier. | Wide, drifting. White flash + shake on beat 1. One cell lands per beat. | replay | main |
| S10 | 20-21 | 0:35.9-0:39.7 | graph |  |  | Game cell opens as a sub-orchestrator: Design, then a Unity orchestrator and a Roblox orchestrator, each sprouting its own subtree (Track, Karts, Combat, Humanoids, UI, Build). | Push into the Game cell; the subtree fills the frame. Edges draw with travelling light. | replay | main |
| S11 | 22-23 | 0:39.7-0:43.4 | focus |  |  | Unity > Karts cell. Step ticker advances, editor viewport frames stream in (kart on track), a code diff glints past. | Zoom into the cell until it is the screen. Step ticks on 8th notes. | replay | main |
| S12 | 24-25 | 0:43.4-0:47.2 | focus |  |  | Roblox > Combat cell. Studio viewport frames: humanoids swinging at each other from karts. | Whip-pan across the graph from the Unity subtree to the Roblox subtree. Motion blur on the pan. | replay | main |
| S13 | 26-27 | 0:47.2-0:51.0 | graph |  |  | Asset handoff. The Unity orchestrator emits a request ('kart + driver models'); a bright edge shoots across the graph to the Assets cell. Inside it: concept image, cutout, mesh, rig, one thumbnail per beat. | Follow the request along the edge. The request fires on the track's big hit (bar 26). Thumbnails pop on beats 1-4 of bar 27. | replay | main |
| S14 | 28 | 0:51.0-0:52.9 | split |  |  | The asset packet travels back and lands in both engines: the same model appears in the Unity viewport and the Roblox viewport. | Pull back to a split stage. Both viewports flash on arrival. | replay | main |
| S15 | 29-30 | 0:52.9-0:56.6 | focus |  |  | Trailer cell. Gameplay strip, beat grid, cuts snapping onto beats; one second of the finished trailer plays in the stage. | Zoom into the Trailer cell. Cut markers snap in time with the music. | replay | main |
| S16 | 31-32 | 0:56.6-1:00.4 | focus |  |  | Campaign cell and its subtree: Explainer reel, Premise reel, Ad image. The Voice cell draws the cloned-voice waveform. Three vertical reel frames stand up side by side. | Slide from Trailer to Campaign. | replay | main |
| S17 | 33 | 1:00.4-1:02.3 | focus |  |  | Host cell. Browser build bar fills, a tunnel line connects to a globe, the public URL types out, a browser frame loads the game. | Zoom into the Host cell. One bar, last bar of the drop: the URL lands on beat 3. | replay | main |
| S18 | 34-35 | 1:02.3-1:06.0 | graph |  |  | Recorder cell shows the graph being recorded (picture in picture, one level of recursion). Then the Verifier: check marks cascade across every cell. | Pull back to wide. The track's breakdown (bars 34-37): quiet, one check per 8th note. | replay | main |
| S19 | 36 | 1:06.0-1:07.9 | split |  |  | Whole tree is green. Two game windows rise out of the graph: the browser build and the Roblox game, both running. | Wide, windows scale up from their cells. | replay (elastic) | main |
| S20 | 37 | 1:07.9-1:09.8 | split |  |  | Full-bleed split gameplay: humanoids fighting while racing, Unity left, Roblox right. | Locked. Hard cuts on every beat inside each half. | clip (elastic) | main |
| S21 | 38-39 | 1:09.8-1:13.6 | split |  | "Make it night." | Roblox premise ad (vertical) with the game behind it. Flips from day to night on the bar-39 downbeat. A 'Lighting' cell flashes in the mini-graph. | Locked. Starts on the track's second drop (bar 38). Day-to-night as a single-frame match cut. | replay | night |
| S22 | 40-41 | 1:13.6-1:17.4 | split |  | "Add crossplay." | Roblox and Unity windows side by side. A Roblox racer appears in the Unity window and a Unity racer in the Roblox window. 'Relay' cell flashes. | Locked. A line links the two windows on the downbeat. | replay | crossplay |
| S23 | 42-43 | 1:17.4-1:21.1 | split |  | "Make it realistic." | Unity window wipes left to right into the upgraded look: post-processing, reflections, lighting. 'Shaders' cell flashes. | Slow push on the Unity window. Wipe lasts exactly 2 beats. | replay | realistic |
| S24 | 44-45 | 1:21.1-1:24.9 | split |  | "Add music." | 'Music' cell flashes. The chosen song plays for 4 seconds with its waveform across the bottom while gameplay continues. | Locked. Demo track ducks under the 4 s song clip, then slams back. | replay | music |
| S25 | 46-47 | 1:24.9-1:28.7 | wall |  |  | Deliverables wall assembles instantly: Play-in-browser link, Roblox link, trailer (2 s), three reels (1 s each), ad image. | Slow drift across the wall. The track's resolve starts here (bar 46). One tile per beat. | replay | main |
| S26 | 48-49 | 1:28.7-1:32.4 | title |  |  | Fake ending. The wall dims, a small wordmark fades up, the music resolves and tails into silence. | Locked. Fade toward black. The beat stops at the end of bar 49; only the bass tail rings on. | ui (elastic) |  |
| S27 | 50 | 1:32.4-1:34.3 | prompt |  | "I'm not done." | The wordmark glitches and rewinds. The text box slams back to center. | Punch in. Author's 1.5 s sound effect. Music returns harder on the next downbeat. | ui |  |
| S28 | 51-52 | 1:34.3-1:38.1 | banner | IMAGE | "Show me a house." | Generated house image resolves full-bleed. | Locked. | replay | house.image |
| S29 | 53 | 1:38.1-1:40.0 | banner | IMAGE EDIT | "Make the walls red." | Same house, same framing, walls red. | Locked. Match cut on the downbeat. | replay | house.red |
| S30 | 54 | 1:40.0-1:41.8 | banner | CUTOUT | "Transparent background." | Background drops away; the dimmed graph shows through behind the house. | Locked. | replay | house.cutout |
| S31 | 55-56 | 1:41.8-1:45.6 | banner | DRAFTING | "Design the house." | Floor plan drawing: walls, doors and dimensions draw line by line. | Slow push. Lines draw to the hi-hat. | replay | house.plan |
| S32 | 57-58 | 1:45.6-1:49.4 | banner | 3D | "Build it on Blender." | Blender viewport screenshots: the house rising from the plan. | Locked. One build step per beat. | replay | house.blender |
| S33 | 59 | 1:49.4-1:51.3 | banner | RENDER | "Render it." | Realistic render resolves from noise. | Locked. | replay | house.render |
| S34 | 60-61 | 1:51.3-1:55.0 | banner | VIDEO | "Make it a video." | The render comes alive as a short clip. | Locked. | clip | house.video |
| S35 | 62-65 | 1:55.0-2:02.6 | banner | STUDY | "Check all presentations on Canvas and make a study guide for every... single... test." | Course decks fan out. On 'every', 'single', 'test': one guide, a row of guides, a wall of guides. | Pull back one step on each of the three words. Three hits on three consecutive downbeats. | replay | study |
| S36 | 66-67 | 2:02.6-2:06.3 | banner | CAD | "CAD a drum shooter FRC robot prototype." | SurfaceCAD assembly builds piece by piece: frame, drum, flywheel, hood. | Slow orbit. One part per beat. | replay | cad |
| S37 | 68-69 | 2:06.3-2:10.1 | banner | SIM |  | The robot shooting inside the FRC simulator. | As supplied. | supplied | cad.sim |
| S38 | 70-71 | 2:10.1-2:13.9 | banner | PCB | "Make a [board to be decided] PCB." | Board layout: traces route themselves, then the board flips to a 3D view. | Locked, flip on the second bar. | replay | pcb |
| S39 | 72-73 | 2:13.9-2:17.6 | banner | FORECAST | "Forecast demand." | History line draws, then the forecast and its band extend to the right. | Locked. | replay | forecast |
| S40 | 74 | 2:17.6-2:19.5 | banner | ANOMALY | "Detect anomaly." | Same chart: red markers snap onto the outliers. | Locked. Markers on beats. | replay | anomaly |
| S41 | 75-76 | 2:19.5-2:23.3 | banner | 3D | "Put the car on the house." | The kart from the game lands on the roof of the house in Blender. | Locked. Impact on the second bar's downbeat. | replay | car.house |
| S42 | 77-80 | 2:23.3-2:30.8 | banner | GAME | "Put the house on the game." | The house, kart still on its roof, stands beside the Unity track as racers fight past it. | Hold, then begin a very slow zoom out. | clip (elastic) | house.game |
| S43 | 81-84 | 2:30.8-2:38.4 | rain |  |  | Slow zoom out. The graph now holds every cell from the film. Evidence fades. Prompts swipe through the text box, one per beat. | Continuous zoom out. | ui (elastic) |  |
| S44 | 85-87 | 2:38.4-2:44.0 | rain |  |  | Prompts every half beat. Title word above: 'everything...' | Continuous zoom out. | ui |  |
| S45 | 88-89 | 2:44.0-2:47.8 | rain |  |  | Prompts every quarter beat, blurring. Title: 'and anything...' | Continuous zoom out. Riser to the title hit. | ui |  |
| S46 | 90-93 | 2:47.8-2:55.3 | title |  |  | Every cell implodes into the wordmark: Infinite Harness. | Locked. Big hit on the downbeat. | ui (elastic) |  |
| S47 | 94-95 | 2:55.3-2:59.1 | title |  |  | 'Built with AI' under the wordmark. Cut to black on the last beat. | Locked. Final hit. | ui |  |
<!-- shots:end -->

`Source`: **ui** = interface animation only, **replay** = a real recorded run replayed on the beat clock,
**clip** = a video a real run produced, **supplied** = footage the author provides. `Take` names the recorded
run a shot reads from (`video/takes/<take>/events.jsonl`). *Elastic* shots absorb bars when the real track is
longer or shorter than 96 bars.

## What the author supplies

| Item | Where | Needed by |
|---|---|---|
| Music: Track A (done) and Track B | `video/audio/trackA.m4a`, `video/audio/trackB.*` | Assembly |
| Beat timings | measured from the tracks into `video/beats.json` | Before capture |
| Voice lines (one recording per line, or one take) | `video/audio/voice/` | Assembly; word timings drive the typing in the text box |
| "I'm not done" sound effect (1.5 s) | `video/audio/sfx/not_done.*` | S27 |
| 4 s of the chosen song | `video/audio/song4s.*` | S24 |
| FRC simulator clip of the CAD robot | `video/takes/cad.sim/` | S37 |
| Which PCB, which company's demand data | `shots.json` S38-S40 | Take capture |

## Budget notes

- Act 1 has 17 bars (32 s) because Track A's drop is at 0:32. The spoken prompt has room: the fastest line is
  2.7 words per second. Say the lines on their bars and leave the gaps; the chips fill them.
- Act 2 has 20 bars. The asset landing (S14), hosting (S17) and the two gameplay shots (S19, S20) are one bar
  each; gameplay keeps running under all of Act 3.
- Act 5 gives every prompt 1 or 2 bars except the study-guide line (4 bars, three hits) and CAD plus sim (4 bars).
- Acts 5-7 will move when Track B is chosen: `resolve.mjs` says how many seconds to add or remove and lists the
  elastic shots.
