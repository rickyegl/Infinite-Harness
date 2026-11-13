// A placeholder asset provider: draws an SVG card with the prompt on it. Lets request_asset and the
// node.request / node.deliver handoff run end to end without a generator.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  ctx.step("Drawing a placeholder", input.prompt, "image");
  const lines: string[] = [];
  for (const w of input.prompt.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last && (last + " " + w).length <= 28) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const text = lines.slice(0, 6).map((l, i) => `<text x="512" y="${440 + i * 64}" text-anchor="middle">${esc(l)}</text>`).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<rect width="1024" height="1024" fill="#14161c"/><rect x="64" y="64" width="896" height="896" rx="48" fill="none" stroke="#5b8cff" stroke-width="6"/>` +
    `<g fill="#e8ecf4" font-family="sans-serif" font-size="48">${text}</g></svg>`;
  const file = join(ctx.dir, "asset.svg");
  writeFileSync(file, svg);
  const uri = await ctx.evidence("image", file, "placeholder");
  return { summary: "Placeholder image ready", files: [{ name: "asset.svg", uri, kind: "image" }] };
}
