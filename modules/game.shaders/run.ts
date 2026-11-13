// "Make it realistic": turns on the realistic look (post-processing, reflections, soft shadows, richer
// materials) and shows the same camera before and after as a wipe. Like the other follow-ups it reaches the
// running build through StreamingAssets/harness.json.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { shotFiles, uriOf } from "../game.unity/lib/parts.ts";
import { live, seconds, setFlags } from "../game/lib/live.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const t0 = Date.now();
  const l = live(ctx);
  const realistic = !/\b(cartoon|toon|flat|simple|stylized|stylised)\b/i.test(input.prompt ?? "");
  if (!l.u) {
    setFlags(l, { realistic }, ctx);
    return { summary: `${realistic ? "Realistic" : "Simple"} look set for the Roblox place` };
  }
  await l.u.ensureEditor();
  const view = "chase";
  ctx.step("Before", `the ${view} camera with the current look`, "camera");
  const [before] = await shotFiles(ctx, l.u, [view], "before");
  ctx.step(realistic ? "Turning on the realistic look" : "Back to the simple look", realistic ? "post-processing volume, bloom, tone mapping, reflections, soft shadows, rougher asphalt" : "flat colours, no post-processing", "sun");
  l.u.patchConfig({ look: { realistic } });
  setFlags(l, { realistic }, ctx);
  const [after] = await shotFiles(ctx, l.u, [view], "after");
  await ctx.evidence("image", before, "Before");
  await ctx.evidence("image", after, realistic ? "Realistic" : "Simple", { before: uriOf(ctx, before), reveal: "wipe", wipeBeats: 2 });
  return { summary: `${realistic ? "Realistic" : "Simple"} look in ${seconds(t0)}${l.buildFlags ? ", live in the running build" : ""}` };
}
