// A new picture from a text prompt, made by the image model behind the local proxy (modules/_shared/image.ts).
// Asks for `count` candidates at once, shows each as evidence and puts out the first one as the cell's image.
// With params.transparent the subject is drawn on a plain background and a Cutout cell removes it.
//
// params: { kind?: "image", name?, size?: "1:1" | "16:9" | ... | "square" | "wide" | "tall", count?: 1-4,
//           transparent?: boolean }
// files: image.jpg (or .png) first, which is what request() delivers.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync } from "node:fs";
import { extname, join } from "node:path";
import { aspectOf, imageCall, imageSize } from "../_shared/image.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const p = input.params ?? {};
  const t0 = Date.now();
  // a direct prompt shows two candidates; an asset request from another module (it names the piece) needs one
  const count = Math.min(4, Math.max(1, Math.round(Number(p.count) || (p.name ? 1 : 2))));
  const aspect = p.size !== undefined ? aspectOf(p.size) : undefined;
  const transparent = p.transparent === true || p.transparent === "true";
  const prompt = transparent
    ? `${input.prompt.trim().replace(/[.\s]+$/, "")}. One subject, centered, whole subject in frame, on a plain flat white background, no shadow on the ground.`
    : input.prompt;

  ctx.step(count > 1 ? `Drawing ${count} candidates` : "Drawing the picture", input.prompt, "image");
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) => imageCall(ctx, prompt, join(ctx.dir, `candidate-${i + 1}`), { aspect })),
  );
  const files = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!files.length) throw new Error((results[0] as PromiseRejectedResult).reason?.message ?? "no picture came back");
  if (count > 1) for (const [i, f] of files.entries()) await ctx.evidence("image", f, `Candidate ${i + 1}`);
  const lost = results.length - files.length;

  let chosen = join(ctx.dir, `image${extname(files[0])}`);
  copyFileSync(files[0], chosen);
  const size = imageSize(chosen);
  ctx.step(count > 1 ? "Picked candidate 1" : "Picture ready", [size && `${size.w} x ${size.h}`, lost && `${lost} call${lost > 1 ? "s" : ""} failed`].filter(Boolean).join(", ") || undefined, "check");

  if (transparent) {
    await ctx.evidence("image", chosen, "On a plain background");
    const cut = await ctx.spawn("assets.cutout", { prompt: "Remove the background", refs: [chosen] }, { label: "Cutout" });
    const uri = cut.files?.[0]?.uri;
    if (!uri) throw new Error("the cutout gave no picture");
    chosen = join(ctx.dir, "..", "..", uri);
  }
  const uri = await ctx.output("image", chosen, "image");
  if (!transparent) await ctx.evidence("image", chosen, input.prompt.slice(0, 120), size ? { width: size.w, height: size.h } : undefined);
  return { summary: `Picture ready in ${Math.round((Date.now() - t0) / 1000)} s`, files: [{ name: chosen.split(/[\\/]/).pop()!, uri, kind: "image" }] };
}
