// Explainer reel: the studio's "What if" explainer recipe (explainers/HOW_TO.md), full length (about 24 s; the
// recipe runs 25-35 s), 1080x1920. Everything lands in the studio's own project folder (explainers/projects/<Name>,
// made by its `studio.py new`); only the final mp4 and the stills are copied into the run.
//
//   script (worker, Template A with a reveal, facts only)  ->  the author's go (the gate)
//   ->  narration in the explainer voice (a voice request, preset "explainer"; cached by text and voice)
//   ->  HyperFrames composition timed to the word timings (worker) -> check -> storyboard -> render
//   ->  sounds from the studio's local library, bottom captions, the studio's assembler, the limiter
//
// params: seconds (default 24), facts (string or string[]; default: what the harness does), audience, rewrite
// (write a new script even if the project has one). A rerun on the same run reuses the project, the script and
// the cached narration, so it costs no voice credits and needs no new go.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gate } from "../_shared/gate.ts";
import { check, render, rules, scaffold, snapshot, tidy } from "../_shared/hyperframes.ts";
import { assemble, bed, captions, cleanCues, narrate, prepareSfx, secondsOf, soundLibrary, spokenWords, timingLines, titleOf, voiceCached, wordRange, type Cue } from "../_shared/reel.ts";
import { ensureProject, peaksOf, projectName, runDirOf, stills, storyboard, studioRoot, uriOf, waveform } from "../_shared/studio.ts";

export const WPS = 2.7;
export const PRESET = "explainer";

export const FACTS = [
  "One sentence typed into the harness builds a playable kart racing game.",
  "It builds the same game in two engines at once: Unity and Roblox.",
  "Made the usual way, a racing game is many separate jobs done by hand: the track, the karts, the riders, the combat, the HUD, then testing and building it.",
  "Under each engine the harness builds six parts side by side: the track, the karts, the riders, combat, the HUD and the build.",
  "It test-drives the race on autopilot and records the play before it hands the game over.",
  "The player picks a rider class before the race.",
  "Every step shows up live as a graph of cells, each with its own pictures and clips, while it works.",
  "Follow-ups in plain words change the finished game: \"make it night\" relights it, \"make it realistic\" changes its look, \"add music\" scores it.",
  "It makes its own assets when a part asks for them: pictures, music and narration.",
];

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
  const facts = Array.isArray(p.facts) ? (p.facts as unknown[]).map(String) : typeof p.facts === "string" ? [p.facts] : FACTS;
  const [lo, hi] = wordRange(seconds, WPS);
  const name = projectName("Harness Explainer", basename(runDirOf(ctx)));
  const proj = await ensureProject(ctx, "explainers", name);
  const scriptFile = join(proj, "script.txt");
  ctx.step("Studio project", `explainers/projects/${name}`, "box");

  // 1. the script
  const have = existsSync(scriptFile) ? readFileSync(scriptFile, "utf8") : "";
  if (!spokenWords(have).length || p.rewrite === true) {
    const brief = fill(readFileSync(join(import.meta.dirname, "script.md"), "utf8"), {
      SECONDS: seconds, WORDS_LO: lo, WORDS_HI: hi, LINES: `${Math.round(seconds / 2.7) - 1}-${Math.round(seconds / 2.7) + 1}`,
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
  const title = titleOf(script) || "What If One Sentence Built Your Game?";

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
