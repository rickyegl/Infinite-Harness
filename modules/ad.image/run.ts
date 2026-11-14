// Ad Image: one ad for one audience at each platform size. The picture comes from the Image module (an asset
// request, so the hand-off shows), drawn without text; the headline and the call to action are set here, so the
// words are always spelled right, then each size is cropped to exact pixels.
//
// params: headline, cta, audience, formats (default ["feed", "story"]; also "link"). Without a headline, a quoted
// phrase in the prompt is used, else a default line.
// files: one PNG per format, feed first.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { refPath } from "../_shared/image.ts";
import { python, why } from "../_shared/studio.ts";

export const FORMATS = {
  feed: { w: 1080, h: 1080, aspect: "1:1", label: "Feed 1:1" },
  story: { w: 1080, h: 1920, aspect: "9:16", label: "Story 9:16" },
  link: { w: 1200, h: 628, aspect: "16:9", label: "Link 1.91:1" },
} as const;
export type Format = keyof typeof FORMATS;

export function formatsOf(params?: Record<string, unknown>): Format[] {
  const want = Array.isArray(params?.formats) ? (params.formats as unknown[]).map(String) : ["feed", "story"];
  const ok = want.filter((f): f is Format => f in FORMATS);
  return ok.length ? [...new Set(ok)] : ["feed", "story"];
}

/** the headline: params, else a quoted phrase in the brief, else a default line */
export function headlineOf(prompt: string, params?: Record<string, unknown>): string {
  if (typeof params?.headline === "string" && params.headline.trim()) return params.headline.trim();
  const q = /["“]([^"”]{4,60})["”]/.exec(prompt);
  return q ? q[1].trim() : "One prompt. A whole game.";
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const p = input.params ?? {};
  const headline = headlineOf(input.prompt, p);
  const cta = typeof p.cta === "string" && p.cta.trim() ? p.cta.trim() : "Watch it build";
  const formats = formatsOf(p);
  const audience = typeof p.audience === "string" ? p.audience : "";
  ctx.step("Ad copy", `${headline} / ${cta}`, "pencil");

  // one picture per aspect the formats need
  const aspects = [...new Set(formats.map((f) => FORMATS[f].aspect))];
  const pictures = new Map<string, string>();
  for (const aspect of aspects) {
    const brief = `${input.prompt.trim().replace(/[.\s]+$/, "")}. An advertising key visual${audience ? ` for ${audience}` : ""}: bold, bright, one clear subject, room at the top for a headline. No text, no letters, no logos, no watermark. No pink or magenta.`;
    const got = await ctx.request("assets.image", { prompt: brief, params: { size: aspect, name: `ad ${aspect}`, count: 1 } });
    const uri = got.files?.[0]?.uri;
    if (!uri) throw new Error("the image module gave no picture");
    pictures.set(aspect, refPath(ctx, uri));
  }

  const files: NonNullable<ModuleOutput["files"]> = [];
  for (const f of formats) {
    const spec = FORMATS[f];
    const out = join(ctx.dir, `ad-${f}.png`);
    const r = await ctx.sh(python(ctx), [join(import.meta.dirname, "compose.py"), pictures.get(spec.aspect)!, out, String(spec.w), String(spec.h), headline, cta], {
      timeoutMs: 60_000,
      env: { PYTHONIOENCODING: "utf-8" },
    });
    if (r.code !== 0 || !existsSync(out)) throw new Error(`could not lay out the ${f} ad: ${why(r)}`);
    ctx.step(spec.label, `${spec.w} x ${spec.h}`, "image");
    const uri = await ctx.evidence("image", out, `${spec.label}${audience ? `, ${audience}` : ""}`, { width: spec.w, height: spec.h });
    await ctx.output(`ad-${f}.png`, out, "image");
    files.push({ name: `ad-${f}.png`, uri, kind: "image" });
  }
  return { summary: `${files.length} ad size${files.length > 1 ? "s" : ""}: "${headline}"`, files };
}
