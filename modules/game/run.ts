// The game orchestrator. A Design cell writes the design (a worker improvises it); this script then asks the
// asset hub for every piece of shared art at once and starts the Unity and Roblox build teams in parallel from
// the same design. Each team draws its own tree. Follow-ups (night, realistic, music, crossplay) are their own
// modules and find what was built through runs/<id>/game-state.json.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Design, DEFAULT, tidyDesign } from "./lib/design.ts";
import { patchState, runDirOf } from "./lib/state.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx.dir);

  // 1. design (its own cell, so the page shows up as the first child)
  const des = await ctx.spawn("game.design", { prompt: input.prompt }, { label: "Design" });
  const file = (des.files ?? []).map((f) => join(runDir, f.uri)).find((f) => /design\.md$/.test(f));
  const json = file ? file.replace(/design\.md$/, "design.json") : "";
  const design: Design = json && existsSync(json) ? tidyDesign(JSON.parse(readFileSync(json, "utf8"))) : DEFAULT;
  patchState(runDir, { design });

  // 2. shared art: every request at once; a failed one only loses that piece
  const art: Record<string, string> = {};
  if (design.art.length) {
    ctx.step(`Asking for ${design.art.length} piece${design.art.length > 1 ? "s" : ""} of art`, design.art.map((a) => a.name).join(", "), "image");
    await Promise.all(
      design.art.map(async (a) => {
        try {
          const out = await ctx.request(ctx.config.assetKinds?.[a.kind] ?? `assets.${a.kind}`, { prompt: a.prompt, params: { kind: a.kind, name: a.name } });
          const uri = out.files?.[0]?.uri;
          if (uri) art[a.name] = uri;
        } catch (e) {
          ctx.step(`No ${a.name}`, (e as Error).message, "alert");
        }
      }),
    );
    patchState(runDir, { art });
  }

  // 3. both engines in parallel from the same design
  ctx.step("Starting the Unity and Roblox teams", "both build the same design at the same time", "layers");
  const brief = (engine: string) => `Build "${design.title}" in ${engine} from the design: ${design.pitch}`;
  const [u, r] = await Promise.allSettled([
    ctx.spawn("game.unity", { prompt: brief("Unity"), params: { design, art } }, { label: "Unity" }),
    ctx.spawn("game.roblox", { prompt: brief("Roblox"), params: { design, art } }, { label: "Roblox" }),
  ]);
  const line = (name: string, s: PromiseSettledResult<ModuleOutput>) => (s.status === "fulfilled" ? `${name}: ${s.value.summary}` : `${name} failed: ${(s.reason as Error).message}`);
  if (u.status === "rejected" && r.status === "rejected") throw new Error(`${line("Unity", u)}; ${line("Roblox", r)}`);
  return { summary: `${design.title}. ${line("Unity", u)}. ${line("Roblox", r)}` };
}
