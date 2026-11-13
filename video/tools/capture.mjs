// Captures the stage in director mode, frame by frame, into a video file (no audio).
// Frames sit on one global grid: frame k shows range time k / fps, so a cut lands on the first frame at or
// after its shot's start, wherever that shot sits in the range.
//
//   node video/tools/capture.mjs --shot S11                       60 fps, full size, video/renders/S11.mp4
//   node video/tools/capture.mjs --from S09 --to S20 --fps 30 --scale 0.5 --out video/renders/act2.mp4

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { arg, ffmpegPath, launch, openStage, repo, seek, startServer } from "./stage.mjs";

/**
 * @param {{ url: string, browser?: any, query: string, fps: number, scale: number, out: string,
 *           onProgress?: (k: number, n: number) => void }} o
 * @returns {Promise<{ frames: number, duration: number, shots: any[] }>}
 */
export async function capture(o) {
  const browser = o.browser ?? (await launch());
  const width = Math.round(1920 * o.scale), height = Math.round(1080 * o.scale);
  const { page, info, errors } = await openStage(browser, o.url, o.query, { width, height });
  const n = Math.ceil((info.duration / 1000) * o.fps);
  mkdirSync(dirname(o.out), { recursive: true });
  const ff = spawn(ffmpegPath(), [
    "-y", "-v", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(o.fps), "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(o.fps), o.out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  for (let k = 0; k < n; k++) {
    await seek(page, (k * 1000) / o.fps);
    const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    o.onProgress?.(k + 1, n);
  }
  ff.stdin.end();
  await done;
  await page.close();
  if (!o.browser) await browser.close();
  if (errors.length) console.warn(`capture: page reported ${errors.length} error(s), first: ${errors[0]}`);
  return { frames: n, duration: info.duration, shots: info.shots };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const shot = arg("shot", null), from = arg("from", shot), to = arg("to", shot ?? from);
  if (!from) {
    console.error("usage: capture.mjs --shot S11 | --from S09 --to S20 [--fps 60] [--scale 1] [--out file.mp4]");
    process.exit(1);
  }
  const fps = Number(arg("fps", 60)), scale = Number(arg("scale", 1));
  const out = resolve(arg("out", join(repo, "video", "renders", `${from === to ? from : `${from}-${to}`}.mp4`)));
  const srv = await startServer();
  try {
    const r = await capture({
      url: srv.url, query: `from=${from}&to=${to}`, fps, scale, out,
      onProgress: (k, n) => k % fps === 0 && process.stdout.write(`\r${k}/${n} frames`),
    });
    console.log(`\nwrote ${out} (${r.frames} frames, ${(r.duration / 1000).toFixed(3)} s)`);
  } finally {
    srv.stop();
  }
}
