// Motion graphics: brief -> HyperFrames composition (a worker writes index.html) -> check -> storyboard stills
// -> mp4. The reusable building block for titles and cards (the reels and the film's own titles use it).
//
// params: seconds (default 3, or a length in the prompt), resolution ("landscape" 1920x1080 default, "portrait"
// 1080x1920, "square"), fps (default 30).
// files: the mp4 first (what request() and spawn() callers take), then the composition.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, render, rules, scaffold, snapshot, tidy, type Resolution } from "../_shared/hyperframes.ts";
import { duration, storyboard, uriOf, workDir } from "../_shared/studio.ts";

/** a length in the brief: "5 s", "5-second", "5 seconds" */
export function secondsOf(prompt: string, params?: Record<string, unknown>): number {
  const p = Number(params?.seconds);
  if (Number.isFinite(p) && p > 0) return Math.min(60, p);
  const m = /(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:s\b|sec(?:ond)?s?\b)/i.exec(prompt);
  return m ? Math.min(60, Math.max(1, Number(m[1]))) : 3;
}

export function resolutionOf(prompt: string, params?: Record<string, unknown>): Resolution {
  const p = String(params?.resolution ?? params?.aspect ?? "").toLowerCase();
  if (p === "portrait" || p === "9:16" || p === "tall") return "portrait";
  if (p === "square" || p === "1:1") return "square";
  if (p === "landscape" || p === "16:9" || p === "wide") return "landscape";
  if (/\b(vertical|portrait|9:16|reel)\b/i.test(prompt)) return "portrait";
  if (/\bsquare\b|1:1/i.test(prompt)) return "square";
  return "landscape";
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const seconds = secondsOf(input.prompt, input.params);
  const res = resolutionOf(input.prompt, input.params);
  const fps = Number(input.params?.fps) || 30;
  const dir = workDir(ctx, "motion");
  scaffold(dir, "motion");

  const lead = readFileSync(join(import.meta.dirname, "prompt.md"), "utf8").trim();
  const brief = `${lead}\n\n## Rules\n\n${rules(res, seconds)}\n\n## Brief\n\n${input.prompt}`;
  ctx.step("Writing the composition", `${seconds} s, ${res}`, "pencil");
  await ctx.agent(brief, { cwd: dir, timeoutMs: 8 * 60_000 });
  if (!existsSync(join(dir, "index.html"))) throw new Error("the motion worker wrote no index.html");

  // check, and give the worker two goes at fixing what the check finds
  for (let pass = 0; ; pass++) {
    const remote = tidy(dir);
    const problems = [...(await check(ctx, dir)), ...remote.map((u) => `remote file ${u}: put it in the folder or drop it`)];
    if (!problems.length) break;
    if (pass >= 2) throw new Error(`the composition still fails its check: ${problems[0]}`);
    ctx.step("Fixing what the check found", problems[0], "alert");
    await ctx.agent(`${brief}\n\n## Fix\n\nThe check of your index.html found:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nFix index.html.`, { cwd: dir, timeoutMs: 6 * 60_000 });
  }
  ctx.step("Composition passes its check", undefined, "check");

  const at = [0.15, 0.35, 0.6, 0.85].map((f) => Math.round(seconds * f * 100) / 100);
  const frames = await snapshot(ctx, dir, join(ctx.dir, "storyboard"), at);
  if (frames.length) await storyboard(ctx, frames, "Storyboard", 2);
  const uris = frames.map((f) => uriOf(ctx, f));

  ctx.step("Rendering", `${fps} fps`, "film");
  const mp4 = join(ctx.dir, "motion.mp4");
  const took = await render(ctx, dir, mp4, { fps });
  const secs = await duration(ctx, mp4);
  ctx.step("Rendered", `${secs.toFixed(1)} s clip in ${took} s`, "check");
  const uri = await ctx.evidence("video", mp4, input.prompt.slice(0, 120), { frames: uris, fps: 2, loop: true, fit: "contain", seconds: secs, renderSeconds: took });
  await ctx.output("motion.mp4", mp4, "video");
  const html = join(ctx.dir, "index.html");
  copyFileSync(join(dir, "index.html"), html);
  const huri = await ctx.output("index.html", html, "code");
  return {
    summary: `${secs.toFixed(1)} s motion clip`,
    files: [
      { name: "motion.mp4", uri, kind: "video" },
      { name: "index.html", uri: huri, kind: "code" },
    ],
  };
}
