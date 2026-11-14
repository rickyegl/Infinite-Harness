// Changes a picture as asked and keeps its framing: the input image goes to the image model behind the local
// proxy together with the instruction (modules/_shared/image.ts). The input is the first image in refs, else the
// last picture an image cell put out in this run (image chain memory), so follow-ups chain without paths.
//
// files: image.jpg (or .png) first, which is what request() delivers.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync } from "node:fs";
import { extname, join } from "node:path";
import { imageCall, imageSize, inputImage } from "../_shared/image.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const t0 = Date.now();
  const src = inputImage(ctx, input.refs);
  if (!src) throw new Error("no picture to edit: this run has none yet, so ask for one first");
  const before = join(ctx.dir, `before${extname(src)}`);
  copyFileSync(src, before);
  const beforeUri = await ctx.evidence("image", before, "Before");

  ctx.step("Editing the picture", input.prompt, "image");
  const ask = `${input.prompt.trim().replace(/[.\s]+$/, "")}. Change only that: keep everything else, the framing and the camera exactly as they are.`;
  const out = await imageCall(ctx, ask, join(ctx.dir, "image"), { images: [before] });
  const a = imageSize(before), b = imageSize(out);
  ctx.step("Edit ready", b ? `${b.w} x ${b.h}${a && (a.w !== b.w || a.h !== b.h) ? ` (was ${a.w} x ${a.h})` : ", same framing"}` : undefined, "check");
  const uri = await ctx.output("image", out, "image");
  await ctx.evidence("image", out, "After", { reveal: "wipe", before: beforeUri });
  return { summary: `Edited in ${Math.round((Date.now() - t0) / 1000)} s`, files: [{ name: out.split(/[\\/]/).pop()!, uri, kind: "image" }] };
}
