// The video studio project (config paths.studio) and the media helpers every reel module shares.
// The studio is never modified here: its tools are called with their own folder as the working directory, and
// the reels write only into the studio's normal project folders (made by its own `studio.py new`) and the run.
//
// ffmpeg: config paths.ffmpeg (a full path or the bare name). Its folder goes first on PATH for the studio's tools,
// which call ffmpeg and ffprobe by name.

import type { ModuleContext, ShResult } from "@harness/protocol";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const set = (v: unknown): v is string => typeof v === "string" && v.length > 0 && !/^<.*>$/.test(v);

export function studioRoot(ctx: ModuleContext): string {
  const s = ctx.config.paths?.studio;
  if (!set(s)) throw new Error("config paths.studio is not set");
  if (!existsSync(s)) throw new Error("the studio folder (paths.studio) does not exist");
  return s;
}

export const python = (ctx: ModuleContext): string => (set(ctx.config.paths?.python) ? ctx.config.paths.python : "python");
export const ffmpeg = (ctx: ModuleContext): string => (set(ctx.config.paths?.ffmpeg) ? ctx.config.paths.ffmpeg : "ffmpeg");
export function ffprobe(ctx: ModuleContext): string {
  const ff = ffmpeg(ctx);
  return ff === "ffmpeg" ? "ffprobe" : join(dirname(ff), `ffprobe${extname(ff)}`);
}

/** env for a child that calls ffmpeg by name (Windows names the key Path; reuse it so the child gets one) */
export function ffEnv(ctx: ModuleContext, extra: Record<string, string> = {}): Record<string, string> {
  const ff = ffmpeg(ctx);
  const pk = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const path = ff === "ffmpeg" ? {} : { [pk]: `${dirname(ff)}${delimiter}${process.env[pk] ?? ""}` };
  return { ...path, PYTHONIOENCODING: "utf-8", ...extra };
}

/** last useful line of a failed command, for an error message */
export const why = (r: ShResult): string => ((r.stderr || r.stdout).trim().split(/\r?\n/).filter(Boolean).pop() ?? `exit ${r.code}`).slice(0, 240);

/**
 * Runs a studio tool (a path relative to the studio root, e.g. "shared/tools/assemble.py") with python, in the
 * tool's own folder unless `cwd` is given. Throws with the tool's last line when it fails.
 */
export async function studioTool(ctx: ModuleContext, rel: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; what?: string } = {}): Promise<ShResult> {
  const tool = join(studioRoot(ctx), ...rel.split("/"));
  if (!existsSync(tool)) throw new Error(`the studio tool ${rel} is missing`);
  const r = await ctx.sh(python(ctx), [tool, ...args], { cwd: opts.cwd ?? dirname(tool), env: ffEnv(ctx, opts.env), timeoutMs: opts.timeoutMs ?? 10 * 60_000 });
  if (r.code !== 0) throw new Error(`${opts.what ?? rel.split("/").pop()} failed: ${why(r)}`);
  return r;
}

export async function ff(ctx: ModuleContext, args: string[], timeoutMs = 10 * 60_000, what = "ffmpeg"): Promise<void> {
  const r = await ctx.sh(ffmpeg(ctx), ["-y", "-hide_banner", "-loglevel", "error", ...args], { timeoutMs });
  if (r.code !== 0) throw new Error(`${what} failed: ${why(r)}`);
}

export async function duration(ctx: ModuleContext, file: string): Promise<number> {
  const r = await ctx.sh(ffprobe(ctx), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeoutMs: 30_000 });
  const s = Number(r.stdout.trim());
  if (r.code !== 0 || !Number.isFinite(s)) throw new Error(`could not read the length of ${file.split(/[\\/]/).pop()}`);
  return Math.round(s * 1000) / 1000;
}

/** width x height of the first video stream */
export async function videoSize(ctx: ModuleContext, file: string): Promise<[number, number]> {
  const r = await ctx.sh(ffprobe(ctx), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { timeoutMs: 30_000 });
  const [w, h] = r.stdout.trim().split(",").map(Number);
  if (!w || !h) throw new Error(`could not read the size of ${file.split(/[\\/]/).pop()}`);
  return [w, h];
}

/** `n` loudness peaks (0..1) of an audio or video file, for the waveform evidence (meta.peaks) */
export async function peaksOf(ctx: ModuleContext, file: string, n = 120): Promise<number[]> {
  const raw = join(ctx.dir, `.peaks-${process.pid}.pcm`);
  try {
    await ff(ctx, ["-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", raw], 120_000, "reading the audio");
    const buf = readFileSync(raw);
    const count = Math.floor(buf.length / 2);
    const per = Math.max(1, Math.floor(count / n));
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = i * per; j < Math.min(count, (i + 1) * per); j++) m = Math.max(m, Math.abs(buf.readInt16LE(j * 2)));
      out.push(m / 32768);
    }
    const top = Math.max(...out, 1e-6);
    return out.map((v) => Math.round((v / top) * 1000) / 1000);
  } finally {
    rmSync(raw, { force: true });
  }
}

/** the waveform evidence for a narration or a finished reel's sound */
export async function waveform(ctx: ModuleContext, file: string, caption: string, extra: Record<string, unknown> = {}): Promise<string> {
  const secs = await duration(ctx, file);
  return ctx.evidence("audio", file, caption, { peaks: await peaksOf(ctx, file), durationMs: Math.round(secs * 1000), seconds: secs, ...extra });
}

/** `count` stills spread over a video (or at the given seconds), as JPGs in `outDir` */
export async function stills(ctx: ModuleContext, video: string, outDir: string, at: number[] | number, width = 540): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const secs = await duration(ctx, video);
  const times = Array.isArray(at) ? at : Array.from({ length: at }, (_, i) => ((i + 0.5) / at) * secs);
  const files: string[] = [];
  for (const [i, t] of times.entries()) {
    const f = join(outDir, `still-${String(i + 1).padStart(2, "0")}.jpg`);
    await ff(ctx, ["-ss", Math.max(0, Math.min(secs - 0.05, t)).toFixed(3), "-i", video, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "3", f], 60_000, "taking a still");
    files.push(f);
  }
  return files;
}

export const runDirOf = (ctx: ModuleContext): string => resolve(ctx.dir, "..", "..");
/** a run-relative uri for a file inside the run (frame lists in evidence meta) */
export const uriOf = (ctx: ModuleContext, file: string): string => relative(runDirOf(ctx), file).split(sep).join("/");

/** storyboard evidence: a strip of stills that the UI flips through */
export async function storyboard(ctx: ModuleContext, files: string[], caption: string, fps = 2): Promise<string> {
  return ctx.evidence("frames", files[0], caption, { frames: files.map((f) => uriOf(ctx, f)), fps, loop: true, fit: "contain" });
}

/**
 * The beat grid with cut markers, as chart evidence: `energy` is one value per bar (the line), `cuts` the bar
 * index of every cut (the markers).
 */
export async function beatGrid(ctx: ModuleContext, energy: number[], cuts: number[], caption: string, meta: Record<string, unknown> = {}): Promise<string> {
  const file = join(ctx.dir, "beat-grid.json");
  writeFileSync(file, JSON.stringify({ energy, cuts, ...meta }, null, 1));
  return ctx.evidence("chart", file, caption, { history: energy, forecast: [], band: [], anomalies: cuts, drawBeats: 2, ...meta });
}

/**
 * A page picture of a script (one line per beat), for doc evidence: the UI shows docs as page images. Uses the
 * studio's python with its imaging library.
 */
export async function scriptPage(ctx: ModuleContext, text: string, out: string, title: string): Promise<string> {
  const py = join(ctx.dir, ".page.py");
  const src = join(ctx.dir, ".page.txt");
  writeFileSync(src, `${title}\n${text}`, "utf8");
  writeFileSync(py, PAGE_PY, "utf8");
  try {
    const r = await ctx.sh(python(ctx), [py, src, out], { timeoutMs: 60_000, env: { PYTHONIOENCODING: "utf-8" } });
    if (r.code !== 0 || !existsSync(out)) throw new Error(`could not draw the script page: ${why(r)}`);
  } finally {
    rmSync(py, { force: true });
    rmSync(src, { force: true });
  }
  return out;
}

const PAGE_PY = String.raw`
import sys, textwrap
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding="utf-8").read().splitlines()
title, body = lines[0], [l for l in lines[1:]]
W, H, M = 900, 1200, 70
img = Image.new("RGB", (W, H), (244, 246, 250))
d = ImageDraw.Draw(img)
def font(size, bold=False):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try: return ImageFont.truetype(name, size)
        except OSError: pass
    return ImageFont.load_default()
ft, fb = font(40, True), font(30)
d.text((M, M), title, fill=(20, 24, 34), font=ft)
y = M + 80
for para in body:
    if not para.strip():
        y += 18; continue
    for i, row in enumerate(textwrap.wrap(para.replace("*", ""), 44)):
        d.text((M, y), row, fill=(40, 46, 60), font=fb); y += 42
    y += 14
    if y > H - M: break
img.save(out)
`;

/** a cell's own working folder inside the run (not served as artifacts) */
export function workDir(ctx: ModuleContext, name: string): string {
  const d = join(runDirOf(ctx), "work", `${ctx.node}-${name}`);
  mkdirSync(d, { recursive: true });
  return d;
}

/** a studio project name: letters and digits only, as the studio's own projects are named */
export const projectName = (...parts: string[]): string =>
  parts.map((p) => p.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")).join("_");

/**
 * The studio project folder `<gen>/projects/<name>/`, made by the studio's own `studio.py new` the first time
 * (a re-render reuses it). Never `ship`: that writes the catalog the schedulers read.
 */
export async function ensureProject(ctx: ModuleContext, gen: "trailers" | "premise" | "explainers", name: string): Promise<string> {
  const dir = join(studioRoot(ctx), gen, "projects", name);
  if (!existsSync(dir)) await studioTool(ctx, "shared/tools/studio.py", ["new", gen, name], { cwd: studioRoot(ctx), timeoutMs: 30_000, what: "making the studio project" });
  if (!existsSync(dir)) throw new Error(`the studio did not make ${gen}/projects/${name}`);
  return dir;
}

export const listFiles = (dir: string, re: RegExp): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => join(dir, f)) : []);
