// Premise reel: the studio's Roblox premise Short (premise/HOW_TO.md), about 30 s (the recipe runs 35-45 s), set
// in the run's own racing game. Phase 1 here: the script (Template A, opening "In this world,"), the author's go
// (the gate), then the narration in the premise voice (the voice cell's "premise" preset: the recipe's sped-up
// narrator), cached by text and voice so a re-render costs nothing.
//
// The picture (sets on the game's place, the cast, the shot list) is authored in the recording place in Roblox
// Studio after the author's green flag: the project then has gen_shots.py and project.json. With those, the cell
// generates the shots for the lighting, records a take in Studio (capture.py) or reuses the last one when the shots
// are unchanged, and assembles the reel with the cached narration, captions, sounds and bed. Without them it ends
// after the narration and says so.
//
// params: seconds (default 30), rewrite (a new script even if the project has one), lighting ("day" | "night";
// otherwise "night" in the prompt, else day), retake (record even when the shots are unchanged), place (the
// recording place's name in Studio, default "Global Set").

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { DEFAULT } from "../game/lib/design.ts";
import { readState } from "../game/lib/state.ts";
import { gate } from "../_shared/gate.ts";
import { assemble, narrate, secondsOf, spokenText, spokenWords, titleOf, voiceCached, wordRange } from "../_shared/reel.ts";
import { duration, ensureProject, ffEnv, projectName, python, runDirOf, stills, studioRoot, uriOf, waveform, why } from "../_shared/studio.ts";

export const WPS = 4.1;
export const PRESET = "premise";
export const OPENING = /^in this world,/i;

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? ""));

/** true when the spoken text opens with "In this world," as every premise Short does */
export const opensRight = (script: string): boolean => OPENING.test(spokenText(script));

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const p = input.params ?? {};
  const seconds = Math.min(60, Math.max(15, Number(p.seconds) || 30));
  const [lo, hi] = wordRange(seconds, WPS);
  const runDir = runDirOf(ctx);
  const d = readState(runDir).design ?? DEFAULT;
  const name = projectName("Harness Premise", basename(runDir));
  const proj = await ensureProject(ctx, "premise", name);
  const scriptFile = join(proj, "script.txt");
  ctx.step("Studio project", `premise/projects/${name}`, "box");

  // 1. the script
  const game = [
    `"${d.hud?.title || d.title}": ${d.pitch}`,
    `Track: a ${d.track.shape} circuit with ${d.track.loops} loop(s), ${d.track.twists} twist(s) and a ${Math.round(d.track.drop)} m drop; ${d.laps} laps.`,
    `${d.karts.count} karts, each with a rider in one of four classes: volt (electric dash), sniper (a shot every 10 s), shrink (shrinks rivals, speeds up), thrower (throws an item every 3 s).`,
    d.win ? `Winning: ${d.win}` : "",
  ].filter(Boolean).join("\n");
  const brief = fill(readFileSync(join(import.meta.dirname, "script.md"), "utf8"), { SECONDS: seconds, WORDS_LO: lo, WORDS_HI: hi, GAME: game, BRIEF: input.prompt });
  const have = existsSync(scriptFile) ? readFileSync(scriptFile, "utf8") : "";
  if (!spokenWords(have).length || p.rewrite === true) {
    ctx.step("Writing the script", `"In this world," ... ${lo}-${hi} words for about ${seconds} s`, "pencil");
    await ctx.agent(brief, { cwd: proj, timeoutMs: 6 * 60_000 });
    for (let pass = 0; pass < 2; pass++) {
      const text = existsSync(scriptFile) ? readFileSync(scriptFile, "utf8") : "";
      const n = spokenWords(text).length;
      const wrong = [n < lo - 6 || n > hi + 6 ? `it has ${n} spoken words; it needs ${lo}-${hi}` : "", !opensRight(text) ? 'its first spoken words must be exactly "In this world,"' : ""].filter(Boolean);
      if (!wrong.length) break;
      ctx.step("Fixing the script", wrong.join("; "), "alert");
      await ctx.agent(`${brief}\n\n## Fix\n\nRewrite script.txt: ${wrong.join("; ")}. Same story.`, { cwd: proj, timeoutMs: 4 * 60_000 });
    }
  }
  const draft = existsSync(scriptFile) ? readFileSync(scriptFile, "utf8") : "";
  if (!spokenWords(draft).length) throw new Error("the script writer wrote no script.txt");
  if (!opensRight(draft)) throw new Error('the script does not open with "In this world,"');

  // 2. the author's go (a script already read in this voice was approved then)
  const script = voiceCached(ctx, draft, PRESET) ? draft : await gate(ctx, "Premise", scriptFile);
  if (!opensRight(script)) throw new Error('the approved script no longer opens with "In this world,"');
  const title = titleOf(script) || "In This World...";

  // 3. the narration in the premise voice
  const voice = await narrate(ctx, script, PRESET, join(proj, "voice"));
  const secs = await secondsOf(ctx, voice.wav);
  const uri = await waveform(ctx, voice.wav, `Narration, premise voice (${secs.toFixed(1)} s)`, { words: voice.rows.map((r) => ({ w: r.w, start: r.start, end: r.end })) });
  await ctx.output("narration.wav", voice.wav, "audio");
  const lighting = lightingOf(p.lighting, input.prompt);

  // 4. the picture: only once the project has its shot list (gen_shots.py) and assembly file (project.json), which
  // are authored in the recording place after the author's green flag. The cell never invents sets or shots.
  if (!existsSync(join(proj, "gen_shots.py")) || !existsSync(join(proj, "project.json"))) {
    writeFileSync(join(ctx.dir, "premise.json"), JSON.stringify({ project: name, title, seconds: secs, lighting, picture: "waiting for the author's green flag" }, null, 1));
    ctx.step("Picture waits for the green flag", "Sets, cast, shots and the Studio capture start once the author says the combined Roblox place is ready", "alert");
    return {
      summary: `Premise script and ${secs.toFixed(1)} s narration ready: ${title}. The picture waits for the author's green flag.`,
      files: [{ name: "narration.wav", uri, kind: "audio" }],
    };
  }
  const pic = await picture(ctx, proj, lighting, p.retake === true, typeof p.place === "string" ? p.place : "Global Set");
  writeFileSync(join(ctx.dir, "premise.json"), JSON.stringify({ project: name, title, seconds: secs, lighting, picture: pic.out, take: pic.take }, null, 1));
  return {
    summary: `Premise reel (${lighting}, ${pic.seconds.toFixed(1)} s, 9:16): ${title}. ${pic.take === "reused" ? "Same shots as the last take, so the take was reused" : "Recorded a new take in Roblox Studio"}; same narration, no new voice credits.`,
    files: [
      { name: "premise.mp4", uri: pic.uri, kind: "video" },
      { name: "narration.wav", uri, kind: "audio" },
    ],
  };
}

/** "day" or "night": the lighting param wins, then the prompt ("make it night"), then day */
export function lightingOf(param: unknown, prompt?: string): "day" | "night" {
  if (param === "day" || param === "night") return param;
  if (/\bnight(time)?\b/i.test(prompt ?? "")) return "night";
  return "day";
}

type Take = { shots: string; start: number; end: number; frames: number };

/**
 * Shots for the lighting (the project's gen_shots.py), a take (reused when its Shots.lua is unchanged, else
 * recorded by capture.py in Roblox Studio), the studio's assembly with the cached narration, captions, sounds and
 * bed, then stills and the before/after against the other lighting when that one exists.
 */
async function picture(ctx: ModuleContext, proj: string, lighting: "day" | "night", retake: boolean, place: string) {
  const py = python(ctx);
  ctx.step(`Shots (${lighting})`, "the project's shot list with the lighting preset", lighting === "night" ? "moon" : "sun");
  const g = await ctx.sh(py, ["gen_shots.py", ...(lighting === "night" ? ["--night"] : [])], { cwd: proj, timeoutMs: 60_000 });
  if (g.code !== 0) throw new Error(`the shot generator failed: ${why(g)}`);
  const shots = createHash("sha1").update(readFileSync(join(proj, "Shots.lua"))).digest("hex");
  const metaFile = join(proj, "capture", `take_${lighting}.json`);
  const clean = join(proj, "capture", `capture_clean_${lighting}.mkv`);
  let take: Take | null = existsSync(metaFile) && existsSync(clean) ? (JSON.parse(readFileSync(metaFile, "utf8")) as Take) : null;
  const reused = !!take && take.shots === shots && !retake;
  if (reused) ctx.step("Take reused", `the ${lighting} take already has these exact shots`, "check");
  else {
    ctx.step("Recording in Roblox Studio", `${place}: sync the shots, Play, record the viewport, cut the set-change holds`, "record");
    const r = await ctx.sh(py, [join(import.meta.dirname, "capture.py"), studioRoot(ctx), proj, lighting, "--place", place], { cwd: proj, env: ffEnv(ctx), timeoutMs: 6 * 60_000 });
    const line = r.stdout.trim().split(/\r?\n/).pop() ?? "";
    if (r.code !== 0 || !line.startsWith("{")) throw new Error(`the Studio capture failed: ${why(r)}`);
    const got = JSON.parse(line) as { start: number; end: number; frames: number };
    take = { shots, start: got.start, end: got.end, frames: got.frames };
    writeFileSync(metaFile, JSON.stringify(take, null, 1));
  }
  if (!take) throw new Error("no take");

  const base = JSON.parse(readFileSync(join(proj, "project.json"), "utf8")) as { duration: number; out: string; slate: Record<string, number> };
  if (take.end - take.start < base.duration - 0.1) throw new Error(`the take holds ${(take.end - take.start).toFixed(1)} s of picture; the reel needs ${base.duration} s`);
  const out = base.out.replace(/\.mp4$/, `_${lighting}.mp4`);
  const pj = join(proj, `project_${lighting}.json`);
  writeFileSync(pj, JSON.stringify({ ...base, capture: `capture/capture_clean_${lighting}.mkv`, out, slate: { ...base.slate, start: take.start } }, null, 1));
  const final = join(proj, out.replace(/\.mp4$/, "_final.mp4"));
  await assemble(ctx, pj, join(proj, out), final);
  const mp4 = join(ctx.dir, "premise.mp4");
  copyFileSync(final, mp4);

  const seconds = await duration(ctx, mp4);
  const frames = await stills(ctx, mp4, join(ctx.dir, "stills"), 6, 360);
  const uri = await ctx.evidence("video", mp4, `Premise reel (${lighting})`, { frames: frames.map((f) => uriOf(ctx, f)), fps: 2, loop: true, fit: "contain", seconds });
  await ctx.output("premise.mp4", mp4, "video");

  // before/after: the same moment in the other lighting, when that reel exists
  const other = lighting === "night" ? "day" : "night";
  const otherFinal = join(proj, base.out.replace(/\.mp4$/, `_${other}_final.mp4`));
  if (existsSync(otherFinal)) {
    const t = [Math.min(seconds - 0.2, 13.6)];
    const [before] = await stills(ctx, otherFinal, join(ctx.dir, other), t, 540);
    const [after] = await stills(ctx, mp4, join(ctx.dir, lighting), t, 540);
    await ctx.evidence("image", after, lighting === "night" ? "Night" : "Day", { before: uriOf(ctx, before), reveal: "wipe", wipeBeats: 2 });
  }
  return { out: relative(studioRoot(ctx), final).split(sep).join("/"), uri, seconds, take: reused ? "reused" : "recorded" };
}
