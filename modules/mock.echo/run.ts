// Writes the prompt to echo.txt in the cell's folder and shows it as evidence. No worker, no network.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  ctx.step("Echoing", input.prompt, "doc");
  const file = join(ctx.dir, "echo.txt");
  writeFileSync(file, input.prompt + "\n");
  const uri = await ctx.evidence("doc", file, "echo.txt");
  return { summary: `Echoed ${input.prompt.length} characters`, files: [{ name: "echo.txt", uri, kind: "doc" }] };
}
