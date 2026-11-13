// The Roblox orchestrator. Resets the Rojo project (runs/.game/roblox) from modules/game.roblox/template, writes
// the design's title, laps and look into Config.luau with every piece switched off, then runs the six parts as
// child cells one after another, like the Unity side. The place is built with rojo, not opened in Studio.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { unitySections } from "../game/lib/design.ts";
import { patchState, readState, runDirOf } from "../game/lib/state.ts";
import { designOf } from "../game.unity/lib/parts.ts";
import { PARTS } from "./lib/parts.ts";
import { hasTool, placeFor } from "./lib/roblox.ts";

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
  patchState(runDir, { roblox: { project: place.project, node: ctx.node } });

  const done: string[] = [];
  for (const p of PARTS) {
    const out = await ctx.spawn(`game.roblox.${p.id}`, { prompt: p.brief(d), params: { design: d } }, { label: p.label });
    done.push(`${p.label}: ${out.summary}`);
  }
  const built = readState(runDir).roblox?.place;
  return { summary: `${d.title} built as a Roblox place${built ? "" : " (no place file)"}; built, not opened in Studio. ${done.join(". ")}` };
}
