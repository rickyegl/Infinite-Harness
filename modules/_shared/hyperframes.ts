// HTML/GSAP compositions rendered to video by the HyperFrames CLI (installed globally; config paths.hyperframes
// can point at its bin/hyperframes.mjs instead). Runs offline: the project gets a local copy of GSAP instead of
// the CDN script tag the CLI's own `init` writes, and telemetry, update checks and auto-installs are off.
//
// A project is the folder `init` makes: index.html (the root composition), hyperframes.json, meta.json and
// gsap.min.js. The studio's composition rules apply (the HyperFrames notes in explainers/howto/): timed elements get
// class "clip" with data-start and data-duration, one paused root timeline on window.__timelines["main"], only
// deterministic logic (no Date.now, Math.random or network).

import type { ModuleContext, ShResult } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { REPO, ffEnv, why } from "./studio.ts";

export type Resolution = "portrait" | "landscape" | "square";
export const SIZE: Record<Resolution, [number, number]> = { portrait: [1080, 1920], landscape: [1920, 1080], square: [1080, 1080] };

function cliPath(ctx: ModuleContext): string {
  const own = ctx.config.paths?.hyperframes;
  if (typeof own === "string" && !/^<.*>$/.test(own) && existsSync(own)) return own;
  const roots = [process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules"), "/usr/local/lib/node_modules", "/usr/lib/node_modules"].filter(Boolean) as string[];
  for (const r of roots) {
    const p = join(r, "hyperframes", "bin", "hyperframes.mjs");
    if (existsSync(p)) return p;
  }
  throw new Error("the HyperFrames CLI is not installed (npm i -g hyperframes, or set paths.hyperframes)");
}

/** the GSAP build the web app already depends on (copied into each project; never the CDN) */
function gsapFile(): string {
  const pnpm = join(REPO, "node_modules", ".pnpm");
  const dir = existsSync(pnpm) ? readdirSync(pnpm).filter((d) => /^gsap@\d/.test(d)).sort().pop() : undefined;
  const f = dir ? join(pnpm, dir, "node_modules", "gsap", "dist", "gsap.min.js") : "";
  if (!f || !existsSync(f)) throw new Error("no local GSAP build found (pnpm install)");
  return f;
}

const QUIET = { HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_AUTO_INSTALL: "1", HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_CAPTURE_DOTENV: "1" };

export async function hf(ctx: ModuleContext, dir: string, args: string[], timeoutMs = 10 * 60_000): Promise<ShResult> {
  return ctx.sh(process.execPath, [cliPath(ctx), ...args], { cwd: dir, env: ffEnv(ctx, QUIET), timeoutMs });
}

/**
 * Makes (or refreshes) a project folder: the same files `hyperframes init --example blank` writes, minus its agent
 * notes, with GSAP local. `html` is the root composition; when omitted a placeholder is written.
 */
export function scaffold(dir: string, name: string, html?: string): void {
  mkdirSync(dir, { recursive: true });
  copyFileSync(gsapFile(), join(dir, "gsap.min.js"));
  writeFileSync(join(dir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
    media: { autoProxy: true },
  }, null, 2) + "\n");
  if (!existsSync(join(dir, "meta.json"))) writeFileSync(join(dir, "meta.json"), JSON.stringify({ id: name, name }, null, 2) + "\n");
  if (html !== undefined) writeFileSync(join(dir, "index.html"), localGsap(html));
  // the agent-instruction files `init` writes (all-caps names like AGENTS.md); the brief is ours
  for (const f of readdirSync(dir)) if (/^[A-Z]+\.md$/.test(f) && f !== "README.md") rmSync(join(dir, f), { force: true });
}

/** points any GSAP CDN script tag at the local copy */
export const localGsap = (html: string): string => html.replace(/<script[^>]+src=["'][^"']*gsap[^"']*\.js["'][^>]*>\s*<\/script>/gi, '<script src="gsap.min.js"></script>');

/** fixes a composition the worker wrote: local GSAP, and no remote scripts or fonts left */
export function tidy(dir: string): string[] {
  const f = join(dir, "index.html");
  const html = localGsap(readFileSync(f, "utf8"));
  writeFileSync(f, html);
  return [...html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
}

/** `hyperframes check` (lint, runtime, layout, motion, contrast); returns the problems, empty when it passes */
export async function check(ctx: ModuleContext, dir: string): Promise<string[]> {
  const r = await hf(ctx, dir, ["check"], 5 * 60_000);
  if (r.code === 0) return [];
  const text = (r.stdout + "\n" + r.stderr).replace(/\x1b\[[0-9;]*m/g, "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /error|✗|fail/i.test(l));
  return lines.length ? lines.slice(0, 20) : [why(r)];
}

/** PNG stills at the given seconds, in `out` (cleared first) */
export async function snapshot(ctx: ModuleContext, dir: string, out: string, at: number[]): Promise<string[]> {
  rmSync(out, { recursive: true, force: true });
  const r = await hf(ctx, dir, ["snapshot", "--describe", "false", "--no-end", "-o", out, "--at", at.map((t) => t.toFixed(2)).join(",")], 5 * 60_000);
  if (r.code !== 0) throw new Error(`the storyboard snapshot failed: ${why(r)}`);
  const files = existsSync(out) ? readdirSync(out).filter((f) => f.endsWith(".png")).map((f) => join(out, f)) : [];
  const secs = (f: string) => Number(/([\d.]+)s?\.png$/.exec(basename(f))?.[1] ?? 0);
  return files.sort((a, b) => secs(a) - secs(b));
}

/** renders index.html to `out` (mp4); returns render seconds */
export async function render(ctx: ModuleContext, dir: string, out: string, opts: { fps?: number; quality?: "draft" | "looks" | "delivery" } = {}): Promise<number> {
  const t0 = Date.now();
  const r = await hf(ctx, dir, ["render", "-o", out, "-f", String(opts.fps ?? 30), "-q", opts.quality ?? "looks", "--quiet"], 20 * 60_000);
  if (r.code !== 0 || !existsSync(out)) throw new Error(`the render failed: ${why(r)}`);
  return Math.round((Date.now() - t0) / 100) / 10;
}

/** the composition rules a worker gets with its brief (from the studio's HyperFrames notes) */
export function rules(res: Resolution, seconds: number): string {
  const [w, h] = SIZE[res];
  return [
    `Write index.html: one HyperFrames composition, ${w}x${h}, exactly ${seconds} s.`,
    `- <html data-resolution="${res}">, a <meta name="viewport" content="width=${w}, height=${h}">, and <script src="gsap.min.js"></script> (already in the folder; never a CDN).`,
    `- Root: <div id="root" data-composition-id="main" data-start="0" data-duration="${seconds}" data-width="${w}" data-height="${h}">.`,
    "- Every timed element: class=\"clip\", data-start and data-duration (seconds), data-track-index.",
    "- One paused GSAP timeline registered as window.__timelines = window.__timelines || {}; window.__timelines[\"main\"] = gsap.timeline({ paused: true }); add every tween to it. No nested paused timelines.",
    "- Deterministic only: no Date.now(), no Math.random(), no fetch, no CSS transitions or keyframes, no setTimeout. All motion is GSAP on that timeline.",
    "- No network: no remote fonts, images or scripts. Use system fonts (e.g. 'Segoe UI', Arial Black) or files you put in the folder.",
    "- No pink or magenta anywhere. No product, vendor or model names in the frame.",
    "- Keep text inside the frame with a safe margin; big, readable type.",
  ].join("\n");
}
