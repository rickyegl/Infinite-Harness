// The Unity orchestrator. Opens the warm Unity 6 project (runs/.game/unity, made from the editor's URP template
// plus modules/game.unity/template), starts the game config over, brings in the shared art, then runs the six
// parts as child cells one after another: they share one editor and one game.json, so each part's shots show
// the game as it grows.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { unitySections } from "../game/lib/design.ts";
import { patchState, readState, runDirOf } from "../game/lib/state.ts";
import { designOf, PARTS, unityFor } from "./lib/parts.ts";

/** the generated meshes already face +Z after the OBJ import (checked in the race shots: with a half turn the karts
 *  drove tail first and the riders sat backwards) */
const MODEL_YAW = 0;

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
  // generated 3D models: each slot's OBJ set (beside its model.glb) goes to Resources/Models/<slot>; the game
  // loads them in place of its primitive kart body, riders, landmarks and trophy
  const models = (input.params?.models as Record<string, string> | undefined) ?? readState(runDir).models ?? {};
  const specs: { slot: string; path: string; texture: string; yaw: number; size: number }[] = [];
  for (const [slot, uri] of Object.entries(models)) {
    const objDir = join(dirname(join(runDir, uri)), "obj");
    if (!existsSync(join(objDir, "model.obj"))) continue;
    const dir = `Models/${slot.replace(/[^\w-]+/g, "-")}`;
    const files = readdirSync(objDir);
    // the texture first, so the model's import finds it
    const tex = files.find((f) => /\.(png|jpe?g)$/i.test(f));
    for (const f of [...files.filter((f) => f !== "model.obj"), "model.obj"]) {
      if (!/\.(obj|mtl|png|jpe?g)$/i.test(f)) continue;
      await u.op("import", { src: join(objDir, f), dest: `Assets/Game/Resources/${dir}/${f}` }, 3 * 60_000);
    }
    specs.push({ slot, path: `${dir}/model`, texture: tex ? `${dir}/${tex.replace(/\.[^.]+$/, "")}` : "", yaw: MODEL_YAW, size: 0 });
  }
  u.patchConfig({ models: specs });
  if (specs.length) ctx.step(`Imported ${specs.length} 3D model${specs.length > 1 ? "s" : ""}`, specs.map((m) => m.slot).join(", "), "cube");

  patchState(runDir, { unity: { project: u.project, node: ctx.node } });

  const done: string[] = [];
  for (const p of PARTS) {
    const out = await ctx.spawn(`game.unity.${p.id}`, { prompt: p.brief(d), params: { design: d } }, { label: p.label });
    done.push(`${p.label}: ${out.summary}`);
  }
  const b = readState(runDir).unity?.build;
  return { summary: `${d.title} built in Unity${b ? ` (${b.target}, ${b.seconds.toFixed(0)} s build)` : ""}. ${done.join(". ")}` };
}
