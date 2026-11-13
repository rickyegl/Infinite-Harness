// Shared helpers for the tools that drive the stage in a headless browser (capture, sheet, rough, tests).
//   startServer()  starts apps/web's dev server on a free fixed port, or uses HARNESS_WEB_URL if set
//   openStage()    opens a director URL and waits for window.__harness.ready
//   ffmpegPath()   env FFMPEG, else config paths.ffmpeg, else "ffmpeg" on PATH

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = join(repo, "apps", "web");

export function config() {
  const read = (f) => (existsSync(join(repo, f)) ? JSON.parse(readFileSync(join(repo, f), "utf8")) : {});
  const a = read("harness.config.example.json"), b = read("harness.local.json");
  return { ...a, ...b, paths: { ...(a.paths ?? {}), ...(b.paths ?? {}) } };
}

export function ffmpegPath() {
  return process.env.FFMPEG || config().paths?.ffmpeg || "ffmpeg";
}
export function ffprobePath() {
  const f = ffmpegPath();
  return f === "ffmpeg" ? "ffprobe" : f.replace(/ffmpeg(\.exe)?$/i, (m, ext) => `ffprobe${ext ?? ""}`);
}

export const timeline = () => JSON.parse(readFileSync(join(repo, "video", "timeline.json"), "utf8"));

/** Starts vite (unless HARNESS_WEB_URL is set). Returns { url, stop }. */
export async function startServer(port = 5199) {
  if (process.env.HARNESS_WEB_URL) return { url: process.env.HARNESS_WEB_URL.replace(/\/$/, ""), stop: () => {} };
  const url = `http://127.0.0.1:${port}`;
  if (await up(url)) return { url, stop: () => {} };
  const child = spawn(process.execPath, [join(web, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
    cwd: web, stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 150; i++) {
    if (await up(url)) return { url, stop: () => child.kill() };
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`dev server did not start:\n${log}`);
}

async function up(url) {
  try {
    const r = await fetch(url + "/video/timeline.json");
    return r.ok;
  } catch {
    return false;
  }
}

// Chromium flags for byte-identical frames: fixed colour profile and text antialiasing, WebGL on the software
// GPU, and tiles rastered on the CPU in full each time (GPU raster and partial re-raster both leave 1-level
// differences on text that depend on what was drawn before).
export const CHROMIUM_ARGS = [
  "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none",
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-rasterization", "--disable-partial-raster",
];

export async function launch() {
  const { chromium } = await import("playwright");
  return chromium.launch({ args: CHROMIUM_ARGS });
}

/** Opens a director page and waits until it has loaded everything. Returns the page and __harness info. */
export async function openStage(browser, url, query, { width = 1920, height = 1080 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${url}/?director=1&${query}`);
  await page.waitForFunction(() => window.__harness?.ready === true, null, { timeout: 60000 }).catch(async () => {
    const msg = await page.evaluate(() => document.body.innerText).catch(() => "");
    throw new Error(`stage not ready for ${query}: ${msg} ${errors.join(" | ")}`);
  });
  const info = await page.evaluate(() => ({ duration: window.__harness.duration, shots: window.__harness.shots }));
  return { page, info, errors };
}

export async function seek(page, ms) {
  await page.evaluate((t) => window.__harness.seek(t), ms);
}

export function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}
