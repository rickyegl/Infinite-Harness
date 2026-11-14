// Image generation and edits through the local model proxy (its standard chat-completions API). The image model
// id is config `proxy.imageModel`; it never appears in steps, captions or files. A call sends the prompt (and,
// for an edit, the input images as data URLs) and the proxy answers with the picture as a data URL in
// `choices[0].message.images`. The model has no real transparent output (asked for one, it paints a checkerboard),
// so a transparent result always goes through the Cutout module.
//
// Image chain memory: `lastImage` finds the last image an image cell put out in this run, so "show me a house",
// "make the walls red" and "transparent background" chain without paths.

import type { ModuleContext } from "@harness/protocol";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";

/** the modules whose outputs the chain follows */
export const IMAGE_MODULES = ["assets.image", "assets.image.edit", "assets.cutout"];

/** aspect ratios the model takes; also accepts the words square, wide and tall */
const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"];
export function aspectOf(v: unknown, d = "1:1"): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "square") return "1:1";
  if (s === "wide" || s === "landscape") return "16:9";
  if (s === "tall" || s === "portrait") return "9:16";
  return ASPECTS.includes(s) ? s : d;
}

export const runDirOf = (ctx: ModuleContext) => resolve(ctx.dir, "..", "..");

/** an absolute path for a ref: a run-relative uri (a planned cell's input) or a path (request_asset) */
export function refPath(ctx: ModuleContext, ref: string): string {
  return isAbsolute(ref) ? ref : join(runDirOf(ctx), ref);
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/**
 * One call to the image model. `images` are files sent as input (an edit). Writes the picture to `out` plus the
 * extension of what came back (.jpg or .png) and returns that path.
 */
export async function imageCall(ctx: ModuleContext, prompt: string, out: string, opts: { images?: string[]; aspect?: string } = {}): Promise<string> {
  const p = ctx.config.proxy;
  const model = p.imageModel;
  if (!model || /^<.*>$|^TODO/.test(model)) throw new Error("no image model set (config proxy.imageModel)");
  const key = process.env[p.apiKeyEnv];
  const content: unknown[] = [];
  for (const f of opts.images ?? []) {
    const mime = MIME[extname(f).toLowerCase()];
    if (!mime) throw new Error(`not an image the model reads: ${f.split(/[\\/]/).pop()}`);
    content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${readFileSync(f).toString("base64")}` } });
  }
  content.push({ type: "text", text: prompt });
  const perCall = Math.max(p.timeoutMs ?? 0, 180_000);
  let lastErr = "";
  // the proxy rotates sign-ins; a busy one answers 429/5xx (often when several pictures are asked for at once),
  // so wait and try again for about two minutes before giving up (a used-up quota fails at once, see below)
  const WAITS = [5, 10, 20, 30, 45];
  for (let attempt = 0; attempt <= WAITS.length; attempt++) {
    if (ctx.signal.aborted) throw new Error("stopped");
    const timeout = AbortSignal.timeout(perCall);
    const r = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], ...(opts.aspect ? { image_config: { aspect_ratio: opts.aspect } } : {}) }),
      signal: AbortSignal.any([ctx.signal, timeout]),
    });
    if (r.status === 429 || r.status >= 500) {
      lastErr = `the image model is busy (${r.status})`;
      const after = Number(r.headers.get("retry-after"));
      // a long wait means the quota is used up, not a busy moment: say so now instead of retrying for minutes
      if (Number.isFinite(after) && after > 120) {
        const m = Math.ceil(after / 60);
        throw new Error(`the image model's quota is used up; it is free again in about ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`}`);
      }
      if (attempt === WAITS.length) break;
      const wait = Number.isFinite(after) && after > 0 ? Math.min(after, 60) : WAITS[attempt];
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    const j: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`image call failed (${r.status}): ${String(j?.error?.message ?? "").slice(0, 200)}`);
    const msg = j?.choices?.[0]?.message;
    const url: string | undefined = msg?.images?.find((x: any) => typeof x?.image_url?.url === "string")?.image_url.url;
    const m = url && /^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(url);
    if (!m) {
      lastErr = `the image model answered without a picture${msg?.content ? `: ${String(msg.content).slice(0, 160)}` : ""}`;
      continue;
    }
    const file = `${out}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
    writeFileSync(file, Buffer.from(m[2], "base64"));
    return file;
  }
  throw new Error(lastErr || "the image model gave no picture");
}

/** width and height of a PNG or JPEG, read from its header */
export function imageSize(file: string): { w: number; h: number } | null {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9; ) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1], len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/**
 * The last image an image cell (image, edit, cutout) put out in this run: the newest `node.output` of kind image
 * from a cell running one of IMAGE_MODULES. Read from the run's event log, so it also finds images from earlier
 * prompts of the same run. Returns an absolute path, or null.
 */
export function lastImage(ctx: ModuleContext): string | null {
  const runDir = runDirOf(ctx);
  const log = join(runDir, "events.jsonl");
  if (!existsSync(log)) return null;
  const mods = new Map<string, string>();
  let found: string | null = null;
  for (const line of readFileSync(log, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "node.spawn") mods.set(e.node, e.module);
    else if (e.type === "node.output" && e.kind === "image" && IMAGE_MODULES.includes(mods.get(e.node) ?? "")) {
      const f = join(runDir, e.uri);
      if (existsSync(f)) found = f;
    }
  }
  return found;
}

/** the input image for an edit or a cutout: the first image ref, else the last image of the chain */
export function inputImage(ctx: ModuleContext, refs: string[] | undefined): string | null {
  for (const r of refs ?? []) {
    const f = refPath(ctx, r);
    if (/\.(png|jpe?g|webp)$/i.test(f) && existsSync(f)) return f;
  }
  return lastImage(ctx);
}
