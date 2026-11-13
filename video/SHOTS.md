# Demo film: shot layout

The demo film (3 minutes at most, no minimum) is designed first; the app is built to produce these shots. Every screen in the product exists
because a shot needs it.

- **Source of truth:** [shots.json](shots.json). Positions are **bars and beats**, never seconds.
- **Timing:** [beats.json](beats.json) holds the grid: one steady tempo, 128 BPM, for the whole film. The music
  is scored to the film (see [Music cues](#music-cues)), not the other way round. After changing either file run
  `node video/tools/resolve.mjs`: it writes `timeline.json` (seconds per shot), regenerates the table below and
  fails loudly if the film runs past 3:00 or a voice line is too fast to say.
- **Preview:** `node video/tools/preview.mjs` renders a text-card animatic with a click track, plus any music
  listed in `beats.json` (`video/renders/shots-preview.mp4`).
- **Format:** 1920x1080, 60 fps, 2:15 on the current grid (72 bars). Vertical reels appear *inside* the frame as deliverables.

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
| 1. The ask | 1-12 | One spoken prompt, 18-20 s. Each phrase becomes a chip. "Make no mistakes." Enter on the drop. |
| 2. Orchestration | 13-28 | The graph blooms. Zoom into the game orchestrator and its two engine sub-orchestrators, an asset handoff across the tree, trailer, campaign, hosting, verification, gameplay. |
| 3. Direct it | 29-39 | Four spoken changes, each landing on a downbeat: night, crossplay, realistic, music. Deliverables wall. Fake ending. |
| 4. "I'm not done." | 40 | 1.5 s sound effect. The text box slams back. |
| 5. Everything | 41-62 | Rapid prompts, module name on top, mostly one bar each: image, edit, cutout, drafting, 3D, render, video, study guides, CAD, sim, PCB, forecast, anomaly, then the car on the house and the house in the game. |
| 6. Anything | 63-68 | Zoom out, evidence stops, prompts swipe in faster and faster. "everything..." "and anything..." |
| 7. Title | 69-72 | Infinite Harness. Built with AI. |

## Music cues

The music is scored to the film: about ten short cues, one mood each, all at 128 BPM in one key, joined on
bar lines with a reverse swell into a hit at every join. A sound-effect layer driven by the shot list (a blip
per chip, a hit per cell, ticks for the verifier) sits on top. No cue has an arc of its own; the film has it.

How it is built: [score/cues.json](score/cues.json) lists five generated takes (intro, build, drop, break,
second drop: instrumental, 128 BPM, A minor, one shared style sentence) and which whole bars of each take go on
which film bars. `python video/tools/score.py` conforms every take to the grid (measures its tempo, stretches it
to exactly 128 BPM, finds beat 1), cuts the bars, adds the per-bar colour, the stutters and the synthesized
effects, and writes `video/audio/score.wav` at the film's exact length. It then checks each cue's span against
the grid and fails if one is more than 25 ms off. Takes live in `video/audio/takes/` (not committed); the
`seed` in `cues.json` says which candidate was kept, and `downbeat` (seconds) overrides beat 1 for a take that
sounds a beat late.

| Cue | Shots | Bars | Starts | What the music says |
|---|---|---|---|---|
| 1. The empty box | S01-S04 | 1-5 | 0:00 | Almost nothing: a pulse on the cursor. Each chip adds one small sound. |
| 2. The ask piles up | S05-S08 | 6-12 | 0:09 | A new layer joins with every request, so the build is the prompt growing. One silent beat, then Enter. |
| 3. The graph blooms | S09-S17 | 13-24 | 0:22 | Full drop, mechanical and driving. One hit per cell. Accents when the asset request fires (bar 19) and lands (bar 21). |
| 4. Verified | S18-S20 | 25-28 | 0:45 | Thins to ticks while the tree goes green, then lifts into two bars of gameplay. |
| 5. Direct it | S21-S24 | 29-37 | 0:52 | Two bars per command, the change on the second downbeat, each with its own colour: darker for night, call-and-response for crossplay, wider for realistic, ducking under the song (`video/makeasong.mp3`, one bar from bar 36), slamming back on bar 37. |
| 6. Fake ending | S25-S26 | 38-39 | 1:09 | A real cadence and a real stop: the wall bar, then one bar of ringing chord (under 8 beats of stillness). |
| 7. "I'm not done" | S27 | 40 | 1:13 | Rewind effect only. |
| 8. Everything | S28-S42 | 41-62 | 1:15 | Harder and busier than the first drop, stepping up at bars 49, 53 and 57. Hits on "every", "single", "test" (bars 51-52). |
| 9. Anything | S43-S45 | 63-68 | 1:56 | The rhythm itself doubles every two bars with the prompts, then cuts out. |
| 10. Title | S46-S47 | 69-72 | 2:08 | One impact, a tail, a clean end. |

## Shot table

Generated from `shots.json` by `video/tools/resolve.mjs`. Do not edit between the markers.

<!-- shots:start -->
| Shot | Bars | Time | View | Module | Voice line | On screen | Camera / FX | Source | Take |
|---|---|---|---|---|---|---|---|---|---|
| S01 | 1 | 0:00.0-0:01.9 | prompt |  |  | The text box appears alone in the center on the first beat, cursor blinking on the beat. | Locked, slow 2% push in. Near silence: one soft pulse per beat. | ui (elastic) |  |
| S02 | 2-3 | 0:01.9-0:05.6 | prompt |  | "Make a 3d racing game where humanoids fight while racing..." | Words land in the box as they are spoken. A 'Game' chip slides out under the box. | Locked. Chip pops on the shot's second downbeat. | ui | main |
| S03 | 4 | 0:05.6-0:07.5 | prompt |  | "...on Unity. And Roblox." | The Game chip splits in two: 'Unity' on beat 1, 'Roblox' on beat 3. | Locked. A small impact under 'Roblox'. | ui | main |
| S04 | 5 | 0:07.5-0:09.4 | prompt |  | "Also make a game trailer." | 'Trailer' chip. | Locked. | ui | main |
| S05 | 6-7 | 0:09.4-0:13.1 | prompt |  | "also Make an ad campaign tailored to Unity and Roblox players" | 'Campaign' chip with three mini chips (Explainer, Reel, Image). | Locked. The music starts building here: every chip from now on adds a layer. | ui | main |
| S06 | 8 | 0:13.1-0:15.0 | prompt |  | "Host the game on browser,and." | 'Host' chip with a globe tick. | Locked. | ui | main |
| S07 | 9-10 | 0:15.0-0:18.8 | prompt |  | "oh, and at the end Show the process on a video." | 'Recorder' chip with a red record dot that starts blinking and keeps blinking for the rest of the film. | Locked. | ui | main |
| S08 | 11-12 | 0:18.8-0:22.5 | prompt |  | "Make no mistakes." | A thin 'Verifier' ring closes around every chip. Beat of silence. Enter key press exactly on the next downbeat. | Locked, then 1-frame punch on Enter. Line spoken in the first bar. The ring closes over the second bar as the build peaks; its last beat is silent. The second bar is also the spare room for a slower read. | ui | main |
| S09 | 13-14 | 0:22.5-0:26.3 | graph |  |  | DROP. The box collapses into a thin bar at the top and becomes the root cell. First ring fans out: Game, Trailer, Campaign, Voice, Host, Recorder, Verifier. | Wide, drifting. White flash + shake on beat 1. One cell lands per beat. | replay | main |
| S10 | 15-16 | 0:26.3-0:30.0 | graph |  |  | Game cell opens as a sub-orchestrator: Design, then a Unity orchestrator and a Roblox orchestrator, each sprouting its own subtree (Track, Karts, Combat, Humanoids, UI, Build). | Push into the Game cell; the subtree fills the frame. Edges draw with travelling light. | replay | main |
| S11 | 17 | 0:30.0-0:31.9 | focus |  |  | Unity > Karts cell. Step ticker advances, editor viewport frames stream in (kart on track), a code diff glints past. | Zoom into the cell until it is the screen. Step ticks on 8th notes. | replay | main |
| S12 | 18 | 0:31.9-0:33.8 | focus |  |  | Roblox > Combat cell. Studio viewport frames: humanoids swinging at each other from karts. | Whip-pan across the graph from the Unity subtree to the Roblox subtree. Motion blur on the pan. | replay | main |
| S13 | 19-20 | 0:33.8-0:37.5 | graph |  |  | Asset handoff. The Unity orchestrator emits a request ('kart + driver models'); a bright edge shoots across the graph to the Assets cell. Inside it: concept image, cutout, mesh, rig, one thumbnail per beat. | Follow the request along the edge. The request fires on the first downbeat. Thumbnails pop on beats 1-4 of the second bar. | replay | main |
| S14 | 21 | 0:37.5-0:39.4 | split |  |  | The asset packet travels back and lands in both engines: the same model appears in the Unity viewport and the Roblox viewport. | Pull back to a split stage. Both viewports flash on arrival. | replay | main |
| S15 | 22 | 0:39.4-0:41.3 | focus |  |  | Trailer cell. Gameplay strip, beat grid, cuts snapping onto beats; one second of the finished trailer plays in the stage. | Zoom into the Trailer cell. Cut markers snap in time with the music. | replay | main |
| S16 | 23 | 0:41.3-0:43.1 | focus |  |  | Campaign cell and its subtree: Explainer reel, Premise reel, Ad image. The Voice cell draws the cloned-voice waveform. Three vertical reel frames stand up side by side. | Slide from Trailer to Campaign. | replay | main |
| S17 | 24 | 0:43.1-0:45.0 | focus |  |  | Host cell. Browser build bar fills, a tunnel line connects to a globe, the public URL types out, a browser frame loads the game. | Zoom into the Host cell. The URL lands on beat 3. | replay | main |
| S18 | 25 | 0:45.0-0:46.9 | graph |  |  | Recorder cell shows the graph being recorded (picture in picture, one level of recursion). Then the Verifier: check marks cascade across every cell. | Pull back to wide. The music thins out; one check per 16th note. | replay | main |
| S19 | 26 | 0:46.9-0:48.8 | split |  |  | Whole tree is green. Two game windows rise out of the graph: the browser build and the Roblox game, both running. | Wide, windows scale up from their cells. | replay (elastic) | main |
| S20 | 27-28 | 0:48.8-0:52.5 | split |  |  | Full-bleed split gameplay: humanoids fighting while racing, Unity left, Roblox right. | Locked. Hard cuts on every beat inside each half. | clip (elastic) | main |
| S21 | 29-30 | 0:52.5-0:56.3 | split |  | "Make it night." | Roblox premise ad (vertical) with the game behind it. Flips from day to night on the second downbeat. A 'Lighting' cell flashes in the mini-graph. | Locked. Line in the first bar. Day-to-night as a single-frame match cut. | replay | night |
| S22 | 31-32 | 0:56.3-1:00.0 | split |  | "Add crossplay." | Roblox and Unity windows side by side. A Roblox racer appears in the Unity window and a Unity racer in the Roblox window. 'Relay' cell flashes. | Locked. Line in the first bar. A line links the two windows on the second downbeat. | replay | crossplay |
| S23 | 33-34 | 1:00.0-1:03.8 | split |  | "Make it realistic." | Unity window wipes left to right into the upgraded look: post-processing, reflections, lighting. 'Shaders' cell flashes. | Slow push on the Unity window. Line in the first bar. The wipe starts on the second downbeat and lasts exactly 2 beats. | replay | realistic |
| S24 | 35-37 | 1:03.8-1:09.4 | split |  | "Add music." | 'Music' cell flashes. The chosen song plays for one bar (about 2 seconds) with its waveform across the bottom while gameplay continues. | Locked. Line in the first bar. The song lands on the next downbeat and the score ducks under it, then slams back on the bar after. | replay | music |
| S25 | 38 | 1:09.4-1:11.3 | wall |  |  | Deliverables wall assembles instantly: Play-in-browser link, Roblox link, trailer (2 s), three reels (1 s each), ad image. | Slow drift across the wall. The music resolves. One tile per half beat. | replay | main |
| S26 | 39 | 1:11.3-1:13.1 | title |  |  | Fake ending. The wall dims, a small wordmark fades up, the music resolves and tails into silence. | Locked. Fade toward black. A real final chord: the beat stops and only its tail rings on. | ui (elastic) |  |
| S27 | 40 | 1:13.1-1:15.0 | prompt |  | "I'm not done." | The wordmark glitches and rewinds. The text box slams back to center. | Punch in. Author's 1.5 s sound effect over a rewind riser. The music returns harder on the next downbeat. | ui |  |
| S28 | 41 | 1:15.0-1:16.9 | banner | IMAGE | "Show me a house." | Generated house image resolves full-bleed. | Locked. | replay | house.image |
| S29 | 42 | 1:16.9-1:18.8 | banner | IMAGE EDIT | "Make the walls red." | Same house, same framing, walls red. | Locked. Match cut on the downbeat. | replay | house.red |
| S30 | 43 | 1:18.8-1:20.6 | banner | CUTOUT | "Transparent background." | Background drops away; the dimmed graph shows through behind the house. | Locked. | replay | house.cutout |
| S31 | 44 | 1:20.6-1:22.5 | banner | DRAFTING | "Design the house." | Floor plan drawing: walls, doors and dimensions draw line by line. | Slow push. Lines draw to the hi-hat. | replay | house.plan |
| S32 | 45 | 1:22.5-1:24.4 | banner | 3D | "Build it on Blender." | Blender viewport screenshots: the house rising from the plan. | Locked. One build step per beat. | replay | house.blender |
| S33 | 46 | 1:24.4-1:26.3 | banner | RENDER | "Render it." | Realistic render resolves from noise. | Locked. | replay | house.render |
| S34 | 47-48 | 1:26.3-1:30.0 | banner | VIDEO | "Make it a video." | The render comes alive as a short clip. | Locked. | clip | house.video |
| S35 | 49-52 | 1:30.0-1:37.5 | banner | STUDY | "Check all presentations on Canvas and make a study guide for every... single... test." | Course decks fan out. On 'every', 'single', 'test': one guide, a row of guides, a wall of guides. | Pull back one step on each of the three words. Sentence over the first two bars. Hits on 'every' (third bar, beat 1), 'single' (third bar, beat 3) and 'test' (fourth downbeat). | replay | study |
| S36 | 53-54 | 1:37.5-1:41.3 | banner | CAD | "CAD a drum shooter FRC robot prototype." | SurfaceCAD assembly builds piece by piece: frame, drum, flywheel, hood. | Slow orbit. One part per beat in the second bar. | replay | cad |
| S37 | 55 | 1:41.3-1:43.1 | banner | SIM |  | The robot shooting inside the FRC simulator. | As supplied. | supplied | cad.sim |
| S38 | 56 | 1:43.1-1:45.0 | banner | PCB | "Make a [board to be decided] PCB." | Board layout: traces route themselves, then the board flips to a 3D view. | Locked, flip on beat 3. | replay | pcb |
| S39 | 57 | 1:45.0-1:46.9 | banner | FORECAST | "Forecast demand." | History line draws, then the forecast and its band extend to the right. | Locked. | replay | forecast |
| S40 | 58 | 1:46.9-1:48.8 | banner | ANOMALY | "Detect anomaly." | Same chart: red markers snap onto the outliers. | Locked. Markers on beats. | replay | anomaly |
| S41 | 59-60 | 1:48.8-1:52.5 | banner | 3D | "Put the car on the house." | The kart from the game lands on the roof of the house in Blender. | Locked. Impact on the second bar's downbeat. | replay | car.house |
| S42 | 61-62 | 1:52.5-1:56.3 | banner | GAME | "Put the house on the game." | The house, kart still on its roof, stands beside the Unity track as racers fight past it. | Hold, then begin a very slow zoom out. | clip (elastic) | house.game |
| S43 | 63-64 | 1:56.3-2:00.0 | rain |  |  | Slow zoom out. The graph now holds every cell from the film. Evidence fades. Prompts swipe through the text box, one per beat. | Continuous zoom out. Full energy. The rhythm doubles with the prompts in each of the next two shots. | ui (elastic) |  |
| S44 | 65-66 | 2:00.0-2:03.8 | rain |  |  | Prompts every half beat. Title word above: 'everything...' | Continuous zoom out. The rhythm doubles. | ui |  |
| S45 | 67-68 | 2:03.8-2:07.5 | rain |  |  | Prompts every quarter beat, blurring. Title: 'and anything...' | Continuous zoom out. The rhythm doubles again, then cuts to silence on the last beat. | ui |  |
| S46 | 69-70 | 2:07.5-2:11.3 | title |  |  | Every cell implodes into the wordmark: Infinite Harness. | Locked. One final impact on the downbeat. | ui (elastic) |  |
| S47 | 71-72 | 2:11.3-2:15.0 | title |  |  | 'Built with AI' under the wordmark. Fade to black. | Locked. The impact's tail rings out and ends. | ui |  |
<!-- shots:end -->

`Source`: **ui** = interface animation only, **replay** = a real recorded run replayed on the beat clock,
**clip** = a video a real run produced, **supplied** = footage the author provides. `Take` names the recorded
run a shot reads from (`video/takes/<take>/events.jsonl`). *Elastic* shots are the first place to add
or remove bars.

## What the author supplies

| Item | Where | Needed by |
|---|---|---|
| Music | scored to the film in cues (see Music cues) -> `video/audio/` | Assembly |
| Beat timings | fixed: 128 BPM in `video/beats.json` | Before capture |
| Voice lines (one recording per line, or one take) | `video/audio/voice/` | Assembly; word timings drive the typing in the text box |
| "I'm not done" sound effect (1.5 s) | `video/audio/sfx/not_done.*` | S27 |
| 4 s of the chosen song | `video/audio/song4s.*` | S24 |
| FRC simulator clip of the CAD robot | `video/takes/cad.sim/` | S37 |
| Which PCB, which company's demand data | `shots.json` S38-S40 | Take capture |

## Budget notes

- The spoken prompt (49 words) sits in bars 2-11, 18.75 s. Bar 12 is the Verifier ring and the silence before
  Enter; it is also the spare room, so a 20 s read still fits. The fastest line is 2.9 words per second.
- Act 2 has 16 bars. The two engine close-ups, the asset landing, trailer, campaign, hosting and verification are
  one bar each; the bloom, the sub-orchestrators, the handoff and the gameplay get two.
- Act 3 gives each change two bars: the line in the first, the change on the second downbeat. "Add music" has a
  third bar so the song clip runs about 4 s.
- Act 5 gives every prompt one bar, except video, CAD, the car on the house and the house in the game (two bars)
  and the study-guide line (four bars: the sentence over two, then "every", "single", "test").
- There is no minimum length. To slow a moment down, add bars to that shot and re-run the resolver; the limit is
  3:00.
