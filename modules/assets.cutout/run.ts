// Removes a picture's background on the asset forge (the GPU runtime on Colab, see modules/_shared/colab.ts):
// the picture is uploaded (POST /api/uploads) and an `image` pipeline job starts from it, so its first step is
// the upload and the forge runs only "Remove background" and "Finalize" (kept at the picture's own size, not
// trimmed or squared). The input is the first image in refs, else the last picture of the run (image chain
// memory, modules/_shared/image.ts). Results are cached by the picture's bytes under runs/.cache/cutout.
//
// The image model has no real transparent output (asked for one it paints a checkerboard), so there is no
// fallback: without the forge this cell fails with the reason.
//
// files: cutout.png (RGBA) first, which is what request() delivers.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { forgeSession, type Forge } from "../_shared/colab.ts";
import { imageSize, inputImage } from "../_shared/image.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(REPO, "runs", ".cache", "cutout");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Out = { path: string; kind: string; meta?: Record<string, any> };
type Job = { id: string; status: string; steps: { key: string; status: string; attempts?: { status: string; outputs?: Out[]; error?: string }[] }[] };

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const t0 = Date.now();
  const src = inputImage(ctx, input.refs);
  if (!src) throw new Error("no picture to cut out: this run has none yet, so ask for one first");
  const before = join(ctx.dir, `before${extname(src)}`);
  copyFileSync(src, before);
  const beforeUri = await ctx.evidence("image", before, "Before");

  const bytes = readFileSync(before);
  const cached = join(CACHE, `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.png`);
  const out = join(ctx.dir, "cutout.png");
  if (existsSync(cached)) {
    ctx.step("Reusing a cutout made earlier", undefined, "scissors");
    copyFileSync(cached, out);
  } else {
    const forge = await forgeSession(ctx);
    try {
      await cut(ctx, forge, bytes, out);
    } finally {
      forge.release();
    }
    mkdirSync(CACHE, { recursive: true });
    copyFileSync(out, `${cached}.part`);
    renameSync(`${cached}.part`, cached);
  }
  const size = imageSize(out);
  const uri = await ctx.output("image", out, "image");
  await ctx.evidence("image", out, "Background removed", { checker: true, reveal: "wipe", before: beforeUri, ...(size ? { width: size.w, height: size.h } : {}) });
  return { summary: `Cut out in ${Math.round((Date.now() - t0) / 1000)} s`, files: [{ name: "cutout.png", uri, kind: "image" }] };
}

async function cut(ctx: ModuleContext, forge: Forge, bytes: Buffer, out: string) {
  ctx.step("Sending the picture to the forge", `${Math.round(bytes.length / 1024)} KB`, "spark");
  const up = await forge.fetch("/api/uploads", { method: "POST", body: bytes, headers: { "content-type": "application/octet-stream" } });
  if (!up.ok) throw new Error(`forge upload: ${up.status} ${(await up.text()).slice(0, 200)}`);
  const { path, width, height } = (await up.json()) as { path: string; width: number; height: number };
  let [job] = await forge.json<Job[]>("/api/jobs", {
    pipeline: "image",
    prompts: ["cutout"],
    image: path,
    review: false,
    params: { finalize: { trim: false, square: false, size: Math.max(width, height) } },
  });
  const t0 = Date.now();
  let said = "";
  for (;;) {
    if (ctx.signal.aborted) {
      await forge.fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" }).catch(() => {});
      throw new Error("stopped");
    }
    const step = job.steps.find((s) => s.key === "cutout");
    if (step && step.status !== said && ["running", "done", "approved"].includes(step.status)) {
      said = step.status;
      if (said === "running") ctx.step("Removing the background", undefined, "scissors");
    }
    if (job.status === "done") break;
    if (job.status === "failed" || job.status === "cancelled") {
      const bad = job.steps.find((s) => s.status === "failed");
      throw new Error(`forge ${bad?.key ?? "job"} failed: ${bad?.attempts?.at(-1)?.error?.split("\n")[0] ?? job.status}`);
    }
    // one GPU: a cutout may wait behind a 3D model's texture, so allow a long queue
    if (Date.now() - t0 > 45 * 60_000) throw new Error("the forge did not cut the picture out within 45 minutes");
    await sleep(2000);
    try {
      job = await forge.json<Job>(`/api/jobs/${job.id}`);
    } catch (e) {
      if (ctx.signal.aborted || /^forge \//.test((e as Error).message)) throw e;
      if (!(await forge.reconnect())) await sleep(10_000);
    }
  }
  const fin = job.steps.find((s) => s.key === "finalize")?.attempts?.at(-1)?.outputs?.find((o) => o.kind === "image");
  if (!fin) throw new Error("the forge finished without a picture");
  await forge.download(fin.path, out);
  if (fin.meta && fin.meta.alpha === false) throw new Error("the forge returned a picture without transparency");
}
