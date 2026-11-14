// A finished run as a 20-30 s process video: the stage's automatic cut (?director=1&run=<id>) captured frame by
// frame (capture.mjs), with the chosen song under it, faded out at the end.
//
//   node video/tools/record-run.mjs --run <id> --src http://127.0.0.1:7411 --token <t> --out run.mp4
//          [--dur 24] [--fps 12] [--scale 1] [--music video/makeasong.mp3]
//
// The token is read from --token or env HARNESS_TOKEN (never printed).

import { spawn } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { capture } from "./capture.mjs";
import { arg, ffmpegPath, repo, startServer } from "./stage.mjs";

/**
 * @param {{ run: string, src: string, token: string, out: string, dur?: number, fps?: number, scale?: number,
 *           music?: string | null, onProgress?: (k: number, n: number) => void }} o
 */
export async function recordRun(o) {
  const dur = Math.max(20, Math.min(30, o.dur ?? 24));
  const fps = o.fps ?? 12, scale = o.scale ?? 1;
  const srv = await startServer();
  const silent = o.out.replace(/\.mp4$/i, "") + ".picture.mp4";
  try {
    const q = new URLSearchParams({ run: o.run, src: o.src, token: o.token, dur: String(dur) });
    const r = await capture({ url: srv.url, query: q.toString(), fps, scale, out: silent, onProgress: o.onProgress });
    const music = o.music === null ? null : resolve(o.music ?? join(repo, "video", "makeasong.mp3"));
    if (music && existsSync(music)) {
      const len = r.duration / 1000;
      await ff([
        "-i", silent, "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-af", `afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, len - 2).toFixed(2)}:d=2,volume=0.8`,
        "-c:a", "aac", "-b:a", "160k", "-t", len.toFixed(3), "-movflags", "+faststart", o.out,
      ]);
      rmSync(silent, { force: true });
    } else renameSync(silent, o.out);
    return { ...r, fps, scale, music: music && existsSync(music) ? music : null };
  } finally {
    srv.stop();
  }
}

function ff(args) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegPath(), ["-y", "-v", "error", ...args], { stdio: ["ignore", "inherit", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}: ${err.trim().split("\n").pop()}`))));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = arg("run", null), src = arg("src", "http://127.0.0.1:7411");
  const token = arg("token", process.env.HARNESS_TOKEN ?? "");
  if (!run || !token) {
    console.error("usage: record-run.mjs --run <id> [--src <bridge>] --token <t> (or HARNESS_TOKEN) [--out file.mp4] [--dur 24] [--fps 12]");
    process.exit(1);
  }
  const out = resolve(arg("out", join(repo, "video", "renders", `run-${run}.mp4`)));
  const r = await recordRun({
    run, src, token, out, dur: Number(arg("dur", 24)), fps: Number(arg("fps", 12)), scale: Number(arg("scale", 1)),
    onProgress: (k, n) => k % 12 === 0 && process.stdout.write(`\r${k}/${n} frames`),
  });
  console.log(`\nwrote ${out} (${r.frames} frames at ${r.fps} fps, ${(r.duration / 1000).toFixed(1)} s${r.music ? ", with music" : ""})`);
}
