// Premise reel: the studio's Roblox premise Short (premise/HOW_TO.md), about 30 s (the recipe runs 35-45 s), set
// in the run's own racing game. Phase 1 here: the script (Template A, opening "In this world,"), the author's go
// (the gate), then the narration in the premise voice (the voice cell's "premise" preset: the recipe's sped-up
// narrator), cached by text and voice so a re-render costs nothing.
//
// The picture (sets on the game's place, the cast, the shot list, the Studio capture, captions and the mix) is the
// recipe's phases 2-4. It starts only after the author's green flag for the combined recording set and racing
// place (plan/STATUS.md, "Waiting on the author"); until then the cell ends after the narration and says so.
//
// params: seconds (default 30), rewrite (a new script even if the project has one), lighting ("day" | "night",
// for the re-render once the picture exists).

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DEFAULT } from "../game/lib/design.ts";
import { readState } from "../game/lib/state.ts";
import { gate } from "../_shared/gate.ts";
import { narrate, secondsOf, spokenText, spokenWords, titleOf, voiceCached, wordRange } from "../_shared/reel.ts";
import { ensureProject, projectName, runDirOf, waveform } from "../_shared/studio.ts";

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
  writeFileSync(join(ctx.dir, "premise.json"), JSON.stringify({ project: name, title, seconds: secs, lighting: p.lighting ?? "day", picture: "waiting for the author's green flag" }, null, 1));

  // 4. the picture waits for the green flag (the combined recording set and racing place in Roblox Studio)
  ctx.step("Picture waits for the green flag", "Sets, cast, shots and the Studio capture start once the author says the combined Roblox place is ready", "alert");
  return {
    summary: `Premise script and ${secs.toFixed(1)} s narration ready: ${title}. The picture waits for the author's green flag.`,
    files: [{ name: "narration.wav", uri, kind: "audio" }],
  };
}
