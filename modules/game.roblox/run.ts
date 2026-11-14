// The Roblox orchestrator. Resets the Rojo project (runs/.game/roblox) from modules/game.roblox/template, writes
// the design's title, laps and look into Config.luau with every piece switched off, then runs the six parts as
// child cells one after another, like the Unity side. The place is built with rojo, not opened in Studio.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { unitySections } from "../game/lib/design.ts";
import { patchState, readState, runDirOf } from "../game/lib/state.ts";
import { designOf } from "../game.unity/lib/parts.ts";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { modelAssets } from "./lib/assets.ts";
import { PARTS } from "./lib/parts.ts";
import { hasTool, placeFor } from "./lib/roblox.ts";
import { seatOf } from "./lib/seat.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx.dir);
  const d = designOf(ctx, input);
  const place = placeFor(ctx);

  ctx.step("Setting up the Rojo project", "server and client scripts, shared modules, HttpService on for crossplay", "box");
  for (const t of ["rojo", "selene"] as const) if (!hasTool(ctx.config, t)) throw new Error(`${t} is not installed (aftman install in modules/game.roblox/template)`);
  place.reset();
  const s = unitySections(d);
  place.patchConfig({ title: s.title, laps: s.laps, look: s.look, built: { track: false, karts: false, riders: false, combat: false, hud: false } });
  place.patchFlags({});
  // generated 3D models load in the place by Roblox asset id; a model not uploaded yet keeps its part version
  const models = (input.params?.models as Record<string, string> | undefined) ?? readState(runDir).models ?? {};
  const { ids, waiting } = modelAssets(runDir, models);
  // the place cannot read a model's vertices, so the rider's seat in the kart is found here from its OBJ
  const seat = ids.kart && models.kart ? seatOf(join(runDir, dirname(models.kart), "obj", "model.obj")) : null;
  place.patchConfig({ models: seat ? { ...ids, kart: { ...ids.kart, seat } } : ids });
  if (Object.keys(ids).length) ctx.step(`${Object.keys(ids).length} 3D models as Roblox assets`, Object.keys(ids).join(", "), "cube");
  if (waiting.length) {
    ctx.step(`${waiting.length} 3D models not uploaded to Roblox yet`, `${waiting.map((w) => w.slot).join(", ")}: part-built until the author approves the upload`, "cube");
    writeFileSync(join(ctx.dir, "uploads.json"), JSON.stringify(waiting, null, 1));
  }
  patchState(runDir, { roblox: { project: place.project, node: ctx.node, models: { loaded: Object.keys(ids), waiting: waiting.map((w) => w.slot) } } });

  const done: string[] = [];
  for (const p of PARTS) {
    const out = await ctx.spawn(`game.roblox.${p.id}`, { prompt: p.brief(d), params: { design: d } }, { label: p.label });
    done.push(`${p.label}: ${out.summary}`);
  }
  const built = readState(runDir).roblox?.place;
  return { summary: `${d.title} built as a Roblox place${built ? "" : " (no place file)"}; built, not opened in Studio. ${done.join(". ")}` };
}
