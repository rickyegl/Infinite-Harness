// One worker writes the design as JSON (strict schema); the script clamps it to what the games handle,
// writes design.json and design.md into the cell and attaches the page. The parent reads design.json.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { designMarkdown, designSchema, tidyDesign } from "../game/lib/design.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const lead = readFileSync(join(import.meta.dirname, "prompt.md"), "utf8").trim();
  ctx.step("Designing the game", input.prompt, "pencil");
  const r = await ctx.agent(`${lead}\n\n## Request\n\n${input.prompt}`, { schema: designSchema, timeoutMs: 6 * 60_000 });
  let raw: unknown = r.json;
  if (!raw) {
    const m = /\{[\s\S]*\}/.exec(r.text);
    try {
      raw = m ? JSON.parse(m[0]) : undefined;
    } catch {
      raw = undefined;
    }
  }
  if (!raw) throw new Error("the design worker gave no JSON answer");
  const d = tidyDesign(raw as never);
  writeFileSync(join(ctx.dir, "design.json"), JSON.stringify(d, null, 2));
  writeFileSync(join(ctx.dir, "design.md"), designMarkdown(d));
  const t = d.track;
  ctx.step(
    `Track: ${t.shape}, ${t.length.toFixed(0)} m`,
    [t.loops && `${t.loops} loop${t.loops > 1 ? "s" : ""}`, t.twists && `${t.twists} twist${t.twists > 1 ? "s" : ""}`, t.drop && `${t.drop.toFixed(0)} m drop`, t.hover && "hover sections"].filter(Boolean).join(", ") || "no stunts",
    "road",
  );
  ctx.step(`${d.karts.count} karts, riders with a ${d.riders.weapon}`, d.karts.names.slice(0, d.karts.count).join(", "), "game");
  await ctx.evidence("doc", join(ctx.dir, "design.md"), "One-page design");
  return { summary: `${d.title}: ${d.pitch}` };
}
