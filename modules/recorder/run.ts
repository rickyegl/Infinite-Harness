// "Show the process on a video": once every other cell of the run has finished (the Verifier included), the run
// is told in 20-30 s by the stage's automatic cut (apps/web/src/autocut.ts: wide, the three busiest cells, then
// the wall of what it published), captured headless frame by frame (video/tools/capture.mjs) from this bridge,
// with the chosen song under it.
//
// params: dur (s, 20-30, default 24), fps (default 12), scale (default 1 = 1080p), music (a file; "none" for no song)

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { waitForOthers } from "../_shared/runEvents.ts";
import { duration, REPO, videoSize } from "../_shared/studio.ts";
import { runDirOf } from "../game/lib/state.ts";

const SKIP = new Set(["recorder"]);

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx.dir);
  const p = input.params ?? {};
  const g = await waitForOthers(ctx, runDir, SKIP, Number(p.waitMs ?? 6 * 3600_000));
  const cells = g.order.filter((id) => id !== g.root && id !== "assets" && id !== ctx.node).length;
  const dur = Math.max(20, Math.min(30, Number(p.dur ?? 24)));
  const fps = Number(p.fps ?? 12), scale = Number(p.scale ?? 1);
  ctx.step("Directing", `${cells} cells, ${g.outputs.length} outputs: wide, the three busiest cells, then the wall; ${dur} s`, "film");

  const tokenFile = String(ctx.config.bridge.tokenFile ?? "");
  const tf = isAbsolute(tokenFile) ? tokenFile : join(REPO, tokenFile);
  if (!existsSync(tf)) throw new Error("the bridge's pairing token file is missing");
  const token = readFileSync(tf, "utf8").trim();
  const src = String(ctx.config.bridge.url).replace(/\/$/, "");

  const music = p.music === "none" ? null : typeof p.music === "string" ? resolve(REPO, p.music) : undefined;
  const out = join(ctx.dir, "process.mp4");
  const { recordRun } = await import(pathToFileURL(join(REPO, "video", "tools", "record-run.mjs")).href);
  let quarter = 0;
  const t0 = Date.now();
  const r = await recordRun({
    run: ctx.run, src, token, out, dur, fps, scale, music,
    onProgress: (k: number, n: number) => {
      const q = Math.floor((k / n) * 4);
      if (q > quarter && q < 4) {
        quarter = q;
        ctx.step("Capturing", `${k}/${n} frames`, "record");
      }
      if (ctx.signal.aborted) throw new Error("cancelled");
    },
  });
  const secs = await duration(ctx, out);
  const [w, h] = await videoSize(ctx, out);
  ctx.step("Encoded", `${secs.toFixed(1)} s, ${w}x${h}, ${r.fps} fps, ${r.frames} frames in ${Math.round((Date.now() - t0) / 1000)} s${r.music ? ", with the song" : ", no song"}`, "check");
  await ctx.evidence("video", out, "How the run went", { duration: secs, width: w, height: h, fps: r.fps, ...(r.music ? {} : { silent: true }) });
  await ctx.output("Process video", out, "video");
  return { summary: `${secs.toFixed(0)} s process video, ${w}x${h}` };
}
