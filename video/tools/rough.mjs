// The rough cut: every shot captured from the stage at half resolution, on the film's timeline, with a click
// track from the grid (and the score under it if video/<grid.music file> exists).
// Writes video/renders/rough.mp4, `total` seconds long.
// The default 32 fps puts exactly 15 frames on a 128 BPM beat, so every cut is a frame boundary and the
// length is a whole number of frames.
//
//   node video/tools/rough.mjs [--fps 32] [--scale 0.5]

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { capture } from "./capture.mjs";
import { makeGrid } from "./grid.mjs";
import { arg, ffmpegPath, ffprobePath, repo, startServer, timeline } from "./stage.mjs";

const tl = timeline();
const fps = Number(arg("fps", 32)), scale = Number(arg("scale", 0.5));
const total = tl.total;
const renders = join(repo, "video", "renders");
const { bpb, beatTime } = makeGrid(tl.grid);

// every cut must sit on a beat of the grid
const off = tl.shots.map((s) => Math.abs(s.start - beatTime(s.startBeat)));
if (Math.max(...off) > 0.001) {
  console.error(`shots off the grid: ${tl.shots.filter((_, i) => off[i] > 0.001).map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const srv = await startServer();
const video = join(renders, "rough_video.mp4");
let shots;
try {
  const t0 = Date.now();
  const r = await capture({
    url: srv.url, query: `from=${tl.shots[0].id}&to=${tl.shots[tl.shots.length - 1].id}`, fps, scale, out: video,
    onProgress: (k, n) => k % (fps * 5) === 0 && process.stdout.write(`\rcapturing ${k}/${n} frames (${Math.round((Date.now() - t0) / 1000)} s)`),
  });
  shots = r.shots;
  console.log(`\ncaptured ${r.frames} frames`);
} finally {
  srv.stop();
}

// click track: downbeats high, other beats low, quieter where music plays
const music = (tl.grid.music ?? []).filter((m) => existsSync(join(repo, "video", m.file)));
const sr = 44100, n = Math.ceil(total * sr), pcm = new Int16Array(n);
for (let i = 0; beatTime(i) < total; i++) {
  const covered = music.some((m) => beatTime(i) >= m.at && beatTime(i) < (m.until ?? Infinity));
  const down = i % bpb === 0, f = down ? 1500 : 900, amp = (down ? 0.5 : 0.22) * (covered ? 0.3 : 1), s0 = Math.round(beatTime(i) * sr);
  for (let k = 0; k < sr * 0.04 && s0 + k < n; k++) pcm[s0 + k] = Math.sin((2 * Math.PI * f * k) / sr) * amp * 32767 * (1 - k / (sr * 0.04));
}
const wav = Buffer.alloc(44 + n * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(n * 2, 40);
Buffer.from(pcm.buffer).copy(wav, 44);
const click = join(renders, "rough_click.wav");
writeFileSync(click, wav);

const d = total.toFixed(3);
const musicIn = music.flatMap((m) => ["-i", join(repo, "video", m.file)]);
const musicFx = music.map((m, k) => {
  const len = (m.until ?? total) - m.at, fade = m.fadeOut ?? 0;
  return `[${2 + k}:a]atrim=0:${len.toFixed(3)},afade=t=out:st=${(len - fade).toFixed(3)}:d=${fade || 0.01},adelay=${Math.round(m.at * 1000)}:all=1[m${k}]`;
});
const mix = music.length ? `${musicFx.join(";")};[1:a]${music.map((_, k) => `[m${k}]`).join("")}amix=inputs=${music.length + 1}:normalize=0:duration=first[au]` : "[1:a]anull[au]";
const out = join(renders, "rough.mp4");
const r = spawnSync(ffmpegPath(), [
  "-y", "-v", "error", "-i", video, "-i", click, ...musicIn, "-filter_complex", mix,
  "-map", "0:v", "-map", "[au]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", d, out,
], { stdio: "inherit" });
if (r.status !== 0) { console.error("ffmpeg mux failed"); process.exit(1); }

const probe = spawnSync(ffprobePath(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out], { encoding: "utf8" });
const got = Number(probe.stdout.trim());
// the first frame of each shot: the first grid frame at or after its start
const late = shots.map((s) => Math.ceil((s.at / 1000) * fps) / fps - s.at / 1000);
console.log(`wrote video/renders/rough.mp4: ${got.toFixed(3)} s (total ${d} s), ${tl.shots.length} shots, every cut on a beat, ` +
  `first frame of a shot at most ${(Math.max(...late) * 1000).toFixed(1)} ms after its beat; audio: click${music.length ? " + " + music.map((m) => m.file).join(", ") : ""}`);
if (Math.abs(got - total) > 1 / fps) {
  console.error(`duration ${got} differs from total ${total}`);
  process.exit(1);
}
