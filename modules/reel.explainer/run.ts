// Explainer reel: the studio's "What if" explainer recipe (explainers/HOW_TO.md) about the run's own Unity game,
// full length (about 24 s; the recipe runs 25-35 s), 1080x1920. The script explains the game to a player: its
// premise, the track, the fight, the rider classes and how to win, all taken from the game's design. It never
// talks about how the game was made. Everything lands in the studio's own project folder
// (explainers/projects/<Title>_Explainer_<run>, made by its `studio.py new`); only the final mp4 and the stills are
// copied into the run.
//
//   script (worker, Template A with a reveal, facts only)  ->  the author's go (the gate)
//   ->  narration in the explainer voice (a voice request, preset "explainer"; cached by text and voice)
//   ->  HyperFrames composition timed to the word timings (worker) -> check -> storyboard -> render
//   ->  sounds from the studio's local library, bottom captions, the studio's assembler, the limiter
//
// params: seconds (default 24), facts (string or string[]; default: the game's facts from its design), audience,
// rewrite (write a new script even if the project has one). A rerun on the same run reuses the project, the script
// and the cached narration, so it costs no voice credits and needs no new go.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CLASS_INFO, DEFAULT, RIDER_CLASSES, type Design } from "../game/lib/design.ts";
import { readState, type GameState } from "../game/lib/state.ts";
import { gate } from "../_shared/gate.ts";
import { check, render, rules, scaffold, snapshot, tidy } from "../_shared/hyperframes.ts";
import { assemble, bed, captions, cleanCues, narrate, prepareSfx, secondsOf, soundLibrary, spokenWords, timingLines, titleOf, voiceCached, wordRange, type Cue } from "../_shared/reel.ts";
import { ensureProject, peaksOf, projectName, runDirOf, stills, storyboard, studioRoot, uriOf, waveform } from "../_shared/studio.ts";

export const WPS = 2.7;
export const PRESET = "explainer";

const spell = (n: number): string => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);

/** where the Unity build plays */
export const platformOf = (unity: GameState["unity"]): string => (unity?.build?.target === "webgl" ? "in the browser" : "on PC");

/** what the script may say about the game: everything comes from its design and its Unity build */
export function gameFacts(d: Design, unity: GameState["unity"]): string[] {
  const t = d.track;
  const title = d.hud?.title || d.title;
  const lap = unity?.metres ? `about ${Math.round(unity.metres / 10) * 10} metres a lap` : "";
  const parts = [
    t.loops ? `${spell(t.loops)} loop${t.loops > 1 ? "s" : ""}` : "",
    t.twists ? `${spell(t.twists)} twist${t.twists > 1 ? "s" : ""}` : "",
    t.hover ? "glowing hover sections" : "",
    t.drop > 5 ? `a ${Math.round(t.drop)} metre drop` : "",
  ].filter(Boolean);
  const track = [lap, parts.length ? `with ${parts.join(", ")}` : ""].filter(Boolean).join(" ") || `a ${t.shape} circuit`;
  return [
    `"${title}" is a kart racing game made in Unity that you play ${platformOf(unity)}.`,
    `The pitch: ${d.pitch}`,
    `The track: ${track}. A race is ${spell(d.laps)} lap${d.laps > 1 ? "s" : ""}.`,
    t.notes ? `The track in more detail: ${t.notes}` : "",
    `${spell(d.karts.count)} karts race, each with a rider who fights with ${d.riders.weapon}s. You drive one kart; the other ${spell(d.karts.count - 1)} are computer riders who fight back.`,
    d.combat.rules ? `The fight: ${d.combat.rules}` : "",
    `Before the race you pick one of four rider classes, each with its own attack: ${RIDER_CLASSES.map((c) => `${CLASS_INFO[c].name}, ${CLASS_INFO[c].attack}`).join("; ")}.`,
    `How to win: ${d.win}`,
  ].filter(Boolean);
}

/** the game's look, for the picture */
export function gameLook(d: Design): string {
  return [
    `Title "${d.hud?.title || d.title}", accent ${d.hud.accent}, sky ${d.look.sky}, ground ${d.look.ground}.`,
    `Kart colours ${d.karts.colors.slice(0, d.karts.count).join(", ")}; riders: ${d.karts.names.slice(0, d.karts.count).join(", ")}.`,
    `Riders: ${d.riders.notes || `humanoid riders with ${d.riders.weapon}s`}`,
  ].join("\n");
}

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? ""));

/** a reference composition from a shipped explainer in the studio (read only; the worker gets its path) */
function reference(ctx: ModuleContext): string | null {
  const projects = join(studioRoot(ctx), "explainers", "projects");
  for (const name of ["WifiRadar", "OfficeClones"]) {
    const f = join(projects, name, "visuals_hf", "index.html");
    if (existsSync(f)) return f;
  }
  return null;
}

/** Lilita One from a shipped explainer's composition assets */
function lilita(ctx: ModuleContext): string | null {
  const projects = join(studioRoot(ctx), "explainers", "projects");
  for (const p of existsSync(projects) ? readdirSync(projects) : []) {
    const f = join(projects, p, "visuals_hf", "assets", "LilitaOne.ttf");
    if (existsSync(f)) return f;
  }
  return null;
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const p = input.params ?? {};
  const seconds = Math.min(60, Math.max(12, Number(p.seconds) || 24));
  const runDir = runDirOf(ctx);
  const state = readState(runDir);
  const design = state.design ?? DEFAULT;
  const game = design.hud?.title || design.title || "Kart Racer";
  const facts = Array.isArray(p.facts) ? (p.facts as unknown[]).map(String) : typeof p.facts === "string" ? [p.facts] : gameFacts(design, state.unity);
  const [lo, hi] = wordRange(seconds, WPS);
  const name = projectName(game, "Explainer", basename(runDir));
  const proj = await ensureProject(ctx, "explainers", name);
  const scriptFile = join(proj, "script.txt");
  ctx.step("Studio project", `explainers/projects/${name}`, "box");

  // 1. the script
  const have = existsSync(scriptFile) ? readFileSync(scriptFile, "utf8") : "";
  if (!spokenWords(have).length || p.rewrite === true) {
    const brief = fill(readFileSync(join(import.meta.dirname, "script.md"), "utf8"), {
      GAME: game, SECONDS: seconds, WORDS_LO: lo, WORDS_HI: hi, LINES: `${Math.round(seconds / 2.7) - 1}-${Math.round(seconds / 2.7) + 1}`,
      BRIEF: [input.prompt, typeof p.audience === "string" ? `Audience: ${p.audience}.` : ""].filter(Boolean).join("\n"),
      FACTS: facts.map((f) => `- ${f}`).join("\n"),
    });
    ctx.step("Writing the script", `${lo}-${hi} words for about ${seconds} s`, "pencil");
    await ctx.agent(brief, { cwd: proj, timeoutMs: 6 * 60_000 });
    for (let pass = 0; pass < 2; pass++) {
      const n = existsSync(scriptFile) ? spokenWords(readFileSync(scriptFile, "utf8")).length : 0;
      if (n >= lo - 4 && n <= hi + 4) break;
      ctx.step("Script length", `${n} words; asking for ${lo}-${hi}`, "alert");
      await ctx.agent(`${brief}\n\n## Fix\n\nYour script.txt has ${n} spoken words. Rewrite it to ${lo}-${hi} spoken words, same beats.`, { cwd: proj, timeoutMs: 4 * 60_000 });
    }
  }
  if (!existsSync(scriptFile) || !spokenWords(readFileSync(scriptFile, "utf8")).length) throw new Error("the script writer wrote no script.txt");

  // 2. the author's go (a script read before in this voice was approved then)
  const draft = readFileSync(scriptFile, "utf8");
  const script = voiceCached(ctx, draft, PRESET) ? draft : await gate(ctx, "Explainer", scriptFile);
  const title = titleOf(script) || `What If You Could Play ${game}?`;

  // 3. narration in the explainer voice
  const voice = await narrate(ctx, script, PRESET, join(proj, "voice"));
  const voiceSecs = await secondsOf(ctx, voice.wav);
  await waveform(ctx, voice.wav, "Narration, explainer voice", { words: voice.rows.map((r) => ({ w: r.w, start: r.start, end: r.end })) });
  const total = Math.round((voiceSecs + 0.8) * 100) / 100;

  // 4. the composition, timed to the words
  const hfDir = join(proj, "visuals_hf");
  scaffold(hfDir, name);
  const font = lilita(ctx);
  if (font) {
    mkdirSync(join(hfDir, "assets"), { recursive: true });
    copyFileSync(font, join(hfDir, "assets", "LilitaOne.ttf"));
  }
  const library = soundLibrary(ctx);
  const brief = fill(readFileSync(join(import.meta.dirname, "visuals.md"), "utf8"), {
    REFERENCE: reference(ctx) ?? "(none available)",
    GAME: gameLook(design),
    SHOTS: Math.round(total / 2.7),
    SOUNDS: library.join(", "),
    RULES: rules("portrait", total),
    SCRIPT: script.replace(/^#.*$/gm, "").trim(),
    WORDS: timingLines(voice.rows),
  });
  if (!existsSync(join(hfDir, "index.html")) || p.rewrite === true || !/<section/i.test(readFileSync(join(hfDir, "index.html"), "utf8"))) {
    ctx.step("Writing the composition", `${total} s, a cut every ~2.7 s on the word times`, "pencil");
    await ctx.agent(brief, { cwd: proj, timeoutMs: 15 * 60_000 });
  }
  if (!existsSync(join(hfDir, "index.html"))) throw new Error("the visuals worker wrote no visuals_hf/index.html");
  for (let pass = 0; ; pass++) {
    const remote = tidy(hfDir);
    const problems = [...(await check(ctx, hfDir)), ...remote.map((u) => `remote file ${u}: put it in the folder or drop it`)];
    if (!problems.length) break;
    if (pass >= 2) throw new Error(`the composition still fails its check: ${problems[0]}`);
    ctx.step("Fixing what the check found", problems[0], "alert");
    await ctx.agent(`${brief}\n\n## Fix\n\nThe check of visuals_hf/index.html found:\n${problems.map((x) => `- ${x}`).join("\n")}\n\nFix visuals_hf/index.html.`, { cwd: proj, timeoutMs: 8 * 60_000 });
  }
  ctx.step("Composition passes its check", undefined, "check");
  const at = Array.from({ length: 8 }, (_, i) => Math.round(((i + 0.5) / 8) * total * 100) / 100);
  const frames = await snapshot(ctx, hfDir, join(ctx.dir, "storyboard"), at);
  if (frames.length) await storyboard(ctx, frames, "Storyboard", 2);

  ctx.step("Rendering", "1080x1920, 30 fps", "film");
  mkdirSync(join(proj, "visuals"), { recursive: true });
  const renderFile = join(proj, "visuals", "render.mp4");
  const took = await render(ctx, hfDir, renderFile, { fps: 30 });
  ctx.step("Rendered", `${(await secondsOf(ctx, renderFile)).toFixed(1)} s in ${took} s`, "check");

  // 5. sounds, captions, assembly
  let cues: Cue[] = [];
  try {
    cues = JSON.parse(readFileSync(join(hfDir, "cues.json"), "utf8")) as Cue[];
  } catch {
    /* no cue list: only the hook hit */
  }
  cues = cleanCues(Array.isArray(cues) ? cues : [], library, total);
  const sfx = await prepareSfx(ctx, cues, join(proj, "sfx"));
  ctx.step("Sounds", `${sfx.length} cues from the studio's library`, "music");
  await captions(ctx, voice.words, join(proj, "captions.ass"), "bottom", 3);
  const music = bed(ctx, join(proj, "music"));
  const pj = join(proj, "project.json");
  writeFileSync(pj, JSON.stringify({
    capture: "visuals/render.mp4",
    slate: { x: 0, y: 0, w: 1080, h: 1920, start: 0 },
    narration: "voice/narration.wav",
    captions: "captions.ass",
    voice_delay: 0,
    duration: total,
    sfx,
    ...(music ? { music: { file: "music/bed.wav", gain_db: -24 } } : {}),
    out: `out/${name}_Short.mp4`,
  }, null, 1));
  const final = await assemble(ctx, pj, join(proj, "out", `${name}_Short.mp4`), join(proj, "out", `${name}_Short_final.mp4`));

  // 6. into the run
  const mp4 = join(ctx.dir, "explainer.mp4");
  copyFileSync(final, mp4);
  const secs = await secondsOf(ctx, mp4);
  const peaks = await peaksOf(ctx, mp4, 120);
  const head = peaks.slice(0, Math.max(1, Math.round((2 / secs) * peaks.length)));
  if (Math.max(...head) < 0.05) ctx.step("Quiet start", "the first 2 s are nearly silent", "alert");
  await waveform(ctx, mp4, "Final mix", { cues: sfx.map((s) => s.t) });
  const shots = await stills(ctx, mp4, join(ctx.dir, "stills"), 6, 360);
  const uri = await ctx.evidence("video", mp4, title, { frames: shots.map((f) => uriOf(ctx, f)), fps: 2, loop: true, fit: "contain", seconds: secs, renderSeconds: took });
  await ctx.output("explainer.mp4", mp4, "video");
  writeFileSync(join(ctx.dir, "reel.json"), JSON.stringify({ generator: "explainers", project: name, file: final, title }, null, 1));
  return {
    summary: `${secs.toFixed(1)} s explainer: ${title}`,
    files: [{ name: "explainer.mp4", uri, kind: "video" }],
  };
}
