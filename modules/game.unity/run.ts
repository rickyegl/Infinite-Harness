// The Unity orchestrator. Opens the warm Unity 6 project (runs/.game/unity, made from the editor's URP template
// plus modules/game.unity/template), starts the game config over, brings in the shared art, then runs the six
// parts as child cells one after another: they share one editor and one game.json, so each part's shots show
// the game as it grows.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { unitySections } from "../game/lib/design.ts";
import { patchState, readState, runDirOf } from "../game/lib/state.ts";
import { designOf, PARTS, unityFor } from "./lib/parts.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx.dir);
  const d = designOf(ctx, input);
  const u = unityFor(ctx);

  ctx.step("Opening the Unity project", "Unity 6, URP template with the harness editor bridge", "cube");
  const t0 = Date.now();
  const changed = u.prepare();
  await u.ensureEditor();
  await u.op("setup", {}, 10 * 60_000);
  // setup's asset refresh is what makes the editor compile changed scripts; run it again on the new code
  if (changed.some((f) => f.endsWith(".cs"))) {
    await u.settle();
    await u.op("setup", {}, 10 * 60_000);
  }
  const ping = u.json<{ unity: string; webgl: boolean }>(await u.op("ping"));
  ctx.step(`Editor ready in ${((Date.now() - t0) / 1000).toFixed(0)} s`, `Unity ${ping.unity}${ping.webgl ? ", WebGL module installed" : ", no WebGL module (the build falls back to Windows)"}`, "check");

  // a fresh config: nothing built yet, live flags off, the design's title and look
  u.resetConfig();
  const s = unitySections(d);
  u.patchConfig({ title: s.title, laps: s.laps, look: s.look, autopilot: false });

  // shared art: banner images go on the track-side boards
  const art = (input.params?.art as Record<string, string> | undefined) ?? readState(runDir).art ?? {};
  const banners: string[] = [];
  for (const a of d.art.filter((x) => x.kind === "image")) {
    const uri = art[a.name];
    const src = uri ? join(runDir, uri) : "";
    if (!src || !existsSync(src) || !/\.(png|jpe?g)$/i.test(src)) continue;
    const name = a.name.replace(/[^\w-]+/g, "-").toLowerCase();
    await u.op("import", { src, dest: `Assets/Game/Resources/Banners/${name}${src.slice(src.lastIndexOf("."))}` });
    banners.push(`Banners/${name}`);
  }
  if (banners.length) {
    u.patchConfig({ banners });
    ctx.step(`Imported ${banners.length} banner${banners.length > 1 ? "s" : ""}`, banners.join(", "), "image");
  }
  patchState(runDir, { unity: { project: u.project, node: ctx.node } });

  const done: string[] = [];
  for (const p of PARTS) {
    const out = await ctx.spawn(`game.unity.${p.id}`, { prompt: p.brief(d), params: { design: d } }, { label: p.label });
    done.push(`${p.label}: ${out.summary}`);
  }
  const b = readState(runDir).unity?.build;
  return { summary: `${d.title} built in Unity${b ? ` (${b.target}, ${b.seconds.toFixed(0)} s build)` : ""}. ${done.join(". ")}` };
}
