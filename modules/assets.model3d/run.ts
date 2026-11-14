// A 3D model from a text prompt, made on the asset forge (a GPU runtime on Colab, see modules/_shared/colab.ts):
// concept image -> background removed -> 3D shape -> painted texture -> low-poly reduce -> game export, and with
// params.rig a skeleton and skin weights too. Each forge step becomes a step of this cell with its preview image.
// Review gates are approved automatically. Results are cached by prompt and params under runs/.cache/model3d, so a
// second build with the same design reuses them without the GPU.
//
// params: { kind: "model3d", size?: longest side in studs (8), tris?: triangle budget (2000), rig?: boolean }
// files: model.glb first (what request() delivers), then the OBJ set (obj, mtl, png) and, when rigged, model.fbx.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { forgeSession, type Forge } from "../_shared/colab.ts";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(REPO, "runs", ".cache", "model3d");
const TITLES: Record<string, [string, string]> = {
  concept: ["Concept image", "image"],
  cutout: ["Background removed", "scissors"],
  shape: ["3D shape", "cube"],
  texture: ["Painted texture", "image"],
  decimate: ["Low-poly reduce", "layers"],
  export: ["Game export", "box"],
  rig: ["Skeleton and skin weights", "rig"],
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Out = { path: string; kind: string; preview?: string | null; meta?: Record<string, any> };
type Step = { key: string; status: string; params?: Record<string, any>; attempts?: { status: string; message?: string; progress?: number; outputs?: Out[]; error?: string }[] };
type Job = { id: string; status: string; steps: Step[] };

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const p = input.params ?? {};
  const size = num(p.size, 8, 1, 200);
  const tris = Math.round(num(p.tris, 2000, 300, 20000));
  const rig = p.rig === true;
  const key = createHash("sha256").update(JSON.stringify([input.prompt.trim().toLowerCase(), size, tris, rig, 1])).digest("hex").slice(0, 16);
  const cache = join(CACHE, key);

  if (!existsSync(join(cache, "done.json"))) {
    const forge = await forgeSession(ctx);
    try {
      await make(ctx, forge, input.prompt, { size, tris, rig }, cache);
    } finally {
      forge.release();
    }
  } else ctx.step("Reusing a model made earlier", input.prompt, "cube");

  return deliver(ctx, cache, input.prompt, rig);
}

async function make(ctx: ModuleContext, forge: Forge, prompt: string, o: { size: number; tris: number; rig: boolean }, cache: string) {
  let job = await sameJob(forge, prompt, o);
  if (job) ctx.step("Picking up the forge job already making this model", prompt, "spark");
  else {
    ctx.step("Sending the prompt to the forge", prompt, "spark");
    [job] = await forge.json<Job[]>("/api/jobs", {
      pipeline: "mesh",
      prompts: [prompt],
      params: { concept: { count: 1 }, decimate: { target_tris: o.tris }, export: { size: o.size } },
      review: false,
      ...(o.rig ? { run: ["rig"] } : {}),
    });
  }
  const tmp = `${cache}.part`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const seen = new Set<string>();
  const t0 = Date.now();
  // the textures run one at a time on one GPU, so a job may wait a long while behind the others: give up only
  // after 30 minutes with no change at all in its steps (status, attempt status or progress), or 4 hours in all
  let last = t0;
  let mark = "";
  let cur = job;
  for (;;) {
    if (ctx.signal.aborted) {
      await forge.fetch(`/api/jobs/${cur.id}/cancel`, { method: "POST" }).catch(() => {});
      throw new Error("stopped");
    }
    for (const s of cur.steps) {
      const a = s.attempts?.at(-1);
      // a review gate that is not auto-approved (an older forge, or a param the server ignored): approve it
      if (s.status === "review") await forge.json(`/api/jobs/${cur.id}/steps/${s.key}/approve`, {}).catch(() => {});
      if (!["approved", "review", "done"].includes(s.status) || !a || a.status !== "done" || seen.has(s.key)) continue;
      seen.add(s.key);
      await report(ctx, forge, s.key, a.outputs ?? [], tmp);
    }
    if (cur.status === "done") break;
    if (cur.status === "failed" || cur.status === "cancelled") {
      const bad = cur.steps.find((s) => s.status === "failed");
      throw new Error(`forge ${bad ? TITLES[bad.key]?.[0] ?? bad.key : "job"} failed: ${bad?.attempts?.at(-1)?.error?.split("\n")[0] ?? cur.status}`);
    }
    const now = Date.now();
    const m = JSON.stringify(cur.steps.map((s) => [s.status, s.attempts?.length, s.attempts?.at(-1)?.status, s.attempts?.at(-1)?.progress]));
    if (m !== mark) [mark, last] = [m, now];
    if (now - last > 30 * 60_000) throw new Error("the forge job made no progress for 30 minutes");
    if (now - t0 > 4 * 3600_000) throw new Error("the forge job took more than 4 hours");
    await sleep(3000);
    try {
      cur = await forge.json<Job>(`/api/jobs/${cur.id}`);
    } catch (e) {
      // a dropped port forward (the runtime and its job keep going): reopen it and keep polling; the no-progress
      // limit above still ends a forge that never comes back
      if (ctx.signal.aborted || /^forge \//.test((e as Error).message)) throw e;
      if (!(await forge.reconnect())) await sleep(15_000);
    }
  }
  if (!existsSync(join(tmp, "model.glb"))) throw new Error("the forge finished without a game export");
  writeFileSync(join(tmp, "done.json"), JSON.stringify({ prompt, ...o, job: cur.id, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
  rmSync(cache, { recursive: true, force: true });
  copyDir(tmp, cache);
  rmSync(tmp, { recursive: true, force: true });
}

/** a forge job (running or finished) for the same prompt and params, if the forge still has one */
async function sameJob(forge: Forge, prompt: string, o: { size: number; tris: number; rig: boolean }): Promise<Job | undefined> {
  const jobs = await forge.json<(Job & { pipeline: string; steps: (Step & { params?: Record<string, any> })[] })[]>("/api/jobs?limit=100").catch(() => []);
  const step = (j: (typeof jobs)[number], k: string) => j.steps.find((s) => s.key === k);
  return jobs.find(
    (j) =>
      j.pipeline === "mesh" &&
      !["failed", "cancelled"].includes(j.status) &&
      step(j, "concept")?.params?.prompt === prompt &&
      Number(step(j, "decimate")?.params?.target_tris) === o.tris &&
      Number(step(j, "export")?.params?.size) === o.size &&
      (step(j, "rig")?.status !== "skipped") === o.rig,
  );
}

/** one finished forge step: a step line, its preview as evidence, and the files the game needs */
async function report(ctx: ModuleContext, forge: Forge, key: string, outs: Out[], tmp: string) {
  const [title, icon] = TITLES[key] ?? [key, "check"];
  const meta = outs[0]?.meta ?? {};
  const detail =
    key === "decimate" || key === "export"
      ? [meta.triangles && `${meta.triangles} triangles`, meta.texture_size && `${meta.texture_size[0]} px texture`, meta.size_studs && `${meta.size_studs} studs`].filter(Boolean).join(", ")
      : key === "rig"
        ? [meta.bones && `${meta.bones} bones`].filter(Boolean).join(", ")
        : "";
  ctx.step(title, detail || undefined, icon);
  const pic = outs.find((x) => x.kind === "image")?.path ?? outs.find((x) => x.preview)?.preview;
  if (pic) {
    const file = await forge.download(pic, join(tmp, `${key}.png`));
    await ctx.evidence("image", file, title);
  }
  if (key === "export") {
    await forge.download(outs.find((x) => x.kind === "mesh")!.path, join(tmp, "model.glb"));
    const zip = outs.find((x) => x.kind === "bundle");
    if (zip) {
      await forge.download(zip.path, join(tmp, "export.zip"));
      unzip(join(tmp, "export.zip"), join(tmp, "export"));
    }
  }
  if (key === "rig") {
    const zip = outs.find((x) => x.path.endsWith(".zip"));
    if (zip) {
      await forge.download(zip.path, join(tmp, "rigged.zip"));
      unzip(join(tmp, "rigged.zip"), join(tmp, "rigged"));
    }
  }
}

/** unpacks a zip (stored or deflated entries, which is what the forge writes) without an outside tool */
export function unzip(zip: string, dir: string) {
  const b = readFileSync(zip);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(`${basename(zip)} is not a zip`);
  let p = b.readUInt32LE(eocd + 16);
  const count = b.readUInt16LE(eocd + 10);
  const root = resolve(dir);
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error(`${basename(zip)}: bad zip directory`);
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20), nameLen = b.readUInt16LE(p + 28);
    const extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    const name = b.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extra + comment;
    const dest = resolve(root, name);
    if (!dest.startsWith(root + sep) || name.endsWith("/")) continue;
    if (method !== 0 && method !== 8) throw new Error(`${basename(zip)}: zip method ${method}`);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(start, start + size);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, method === 0 ? data : inflateRawSync(data));
  }
}

async function deliver(ctx: ModuleContext, cache: string, prompt: string, rig: boolean): Promise<ModuleOutput> {
  const files: { name: string; uri: string; kind: string }[] = [];
  // files in this cell's folder are served from the run as artifacts/<node>/<name>; the uri is run-relative
  const runDir = resolve(ctx.dir, "..", "..");
  const uri = (file: string) => relative(runDir, file).split(sep).join("/");
  const out = (name: string, src: string) => {
    const dst = join(ctx.dir, name);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    return dst;
  };
  const glb = out("model.glb", join(cache, "model.glb"));
  const done = JSON.parse(readFileSync(join(cache, "done.json"), "utf8"));
  files.push({ name: "model.glb", uri: await ctx.evidence("model3d", glb, prompt, { triangles: done.tris, seconds: done.seconds }), kind: "model3d" });
  const objDir = join(cache, "export", "obj");
  if (existsSync(objDir)) {
    for (const f of readdirSync(objDir)) {
      if (!/\.(obj|mtl|png|jpe?g)$/i.test(f)) continue;
      const file = out(`obj/${f}`, join(objDir, f));
      files.push({ name: `obj/${f}`, uri: uri(file), kind: /\.obj$/i.test(f) ? "model3d" : "file" });
    }
  }
  const rigDir = join(cache, "rigged");
  if (rig && existsSync(rigDir)) {
    for (const f of readdirSync(rigDir)) {
      if (!/\.(fbx|glb|png)$/i.test(f)) continue;
      const file = out(`rigged/${f}`, join(rigDir, f));
      files.push({ name: `rigged/${f}`, uri: uri(file), kind: /\.(fbx|glb)$/i.test(f) ? "model3d" : "file" });
    }
  }
  return { summary: `Model ready${done.seconds ? ` in ${Math.round(done.seconds / 60)} min` : " (from the cache)"}`, files };
}

function copyDir(a: string, b: string) {
  mkdirSync(b, { recursive: true });
  for (const e of readdirSync(a, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(join(a, e.name), join(b, e.name));
    else copyFileSync(join(a, e.name), join(b, e.name));
  }
}

function num(v: unknown, d: number, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}
