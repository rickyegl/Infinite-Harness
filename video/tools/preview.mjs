#!/usr/bin/env node
// Barebones animatic of video/shots.json: one text card per shot, a flash on every cut, a beat dot,
// a progress bar and a click track. Needs ffmpeg on PATH (or FFMPEG=<path>).
// Usage: node video/tools/preview.mjs   ->  video/renders/shots-preview.mp4
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { makeGrid } from "./grid.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(root, "renders");
mkdirSync(out, { recursive: true });

// always resolve first so the preview matches shots.json + beats.json
const res = spawnSync(process.execPath, [join(here, "resolve.mjs")], { stdio: "inherit" });
if (res.status !== 0) console.log("(layout has problems, rendering anyway)");

const { grid, shots } = JSON.parse(readFileSync(join(root, "timeline.json"), "utf8"));
const { bpb, beatTime } = makeGrid(grid);
const music = (grid.music ?? []).filter((m) => existsSync(join(root, m.file)));
const totalBeats = shots.at(-1).startBeat + shots.at(-1).beats;
const total = shots.at(-1).end;

// ---------- subtitles (ASS) ----------
const W = 1280, H = 720;
const ts = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const esc = (s) => String(s ?? "").replace(/[{}]/g, "").replace(/\r?\n/g, " ");
const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const C = { text: "&H00F4ECE8", dim: "&H0099847A", accent: "&H00FFF23D", hit: "&H00632EFF" }; // ASS colours are BGR
const ev = [];
const add = (a, b, style, x, y, an, text, extra = "") => ev.push(`Dialogue: 0,${ts(a)},${ts(b)},${style},,0,0,0,,{\\an${an}\\pos(${x},${y})${extra}}${text}`);
const box = (w, h) => `{\\p1}m 0 0 l ${w} 0 ${w} ${h} 0 ${h}{\\p0}`;

for (const s of shots) {
  const lastBar = s.bar + Math.ceil(s.beats / bpb) - 1;
  const bars = lastBar === s.bar ? `bar ${s.bar}` : `bars ${s.bar}-${lastBar}`;
  add(s.start, s.end, "Mono", 40, 28, 7, `${s.id}   ACT ${s.act}   ${bars}   ${s.dur.toFixed(1)} s`);
  add(s.start, s.end, "Big", W / 2, 150, 5, esc(s.module || s.view.toUpperCase()), s.module ? `\\c${C.accent}` : "");
  if (s.module) add(s.start, s.end, "Small", W / 2, 205, 5, `view: ${s.view}`);
  if (s.say) add(s.start, s.end, "Say", W / 2, 240, 8, `"${esc(s.say)}"`);
  add(s.start, s.end, "Screen", W / 2, s.say ? 370 : 270, 8, esc(s.screen));
  const camfx = [s.camera, s.fx].filter(Boolean).join("  ");
  if (camfx) add(s.start, s.end, "Small", W / 2, 560, 8, esc(camfx));
  add(s.start, s.end, "Mono", 40, H - 30, 1, `${s.source}${s.take ? "   take: " + s.take : ""}${s.elastic ? "   elastic" : ""}`);
  // flash on the cut
  add(s.start, Math.min(s.end, s.start + 0.25), "Mono", 0, 0, 7, box(W, H), `\\c&HFFFFFF&\\alpha&H90&\\bord0\\shad0\\fad(0,220)`);
}
for (let i = 0; i < totalBeats; i++) {
  const a = beatTime(i), b = beatTime(i + 1), down = i % bpb === 0;
  add(a, b, "Mono", W - 40, 28, 9, `${mmss(a)}   bar ${Math.floor(i / bpb) + 1}  beat ${(i % bpb) + 1}`, down ? `\\c${C.hit}` : "");
  const size = down ? 26 : 14;
  add(a, Math.min(b, a + 0.22), "Mono", W - 40 - size, H - 34 - size, 7, box(size, size), `\\c${down ? C.hit : C.accent}\\bord0\\shad0\\fad(0,160)`);
}

const style = (name, font, size, colour, bold = 0) =>
  `Style: ${name},${font},${size},${colour},${colour},&H00000000,&H00000000,${bold},0,0,0,100,100,0,0,1,0,0,5,90,90,20,1`;
const ass = [
  "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  style("Mono", "Consolas", 22, C.dim),
  style("Big", "Arial", 64, C.text, -1),
  style("Say", "Arial", 38, C.accent, -1),
  style("Screen", "Arial", 28, C.text),
  style("Small", "Arial", 21, C.dim), "",
  "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...ev, "",
].join("\n");
writeFileSync(join(out, "shots-preview.ass"), ass);

// ---------- click track (WAV) ----------
const sr = 44100, n = Math.ceil(total * sr), pcm = new Int16Array(n);
for (let i = 0; i < totalBeats; i++) {
  const covered = music.some((m) => beatTime(i) >= m.at && beatTime(i) < (m.until ?? Infinity)); // quieter under music
  const down = i % bpb === 0, f = down ? 1500 : 900, amp = (down ? 0.5 : 0.22) * (covered ? 0.3 : 1), s0 = Math.round(beatTime(i) * sr);
  for (let k = 0; k < sr * 0.04 && s0 + k < n; k++) pcm[s0 + k] = Math.sin((2 * Math.PI * f * k) / sr) * amp * 32767 * (1 - k / (sr * 0.04));
}
const wav = Buffer.alloc(44 + n * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(n * 2, 40);
Buffer.from(pcm.buffer).copy(wav, 44);
writeFileSync(join(out, "shots-preview-click.wav"), wav);

// ---------- render ----------
const d = total.toFixed(3);
// music entries from beats.json: placed at `at`, cut at `until` with a fade, mixed over the click track
const musicIn = music.flatMap((m) => ["-i", join(root, m.file)]);
const musicFx = music.map((m, k) => {
  const len = (m.until ?? total) - m.at, fade = m.fadeOut ?? 0;
  return `[${3 + k}:a]atrim=0:${len.toFixed(3)},afade=t=out:st=${(len - fade).toFixed(3)}:d=${fade || 0.01},adelay=${Math.round(m.at * 1000)}:all=1[m${k}]`;
});
const mix = music.length
  ? `;${musicFx.join(";")};[2:a]${music.map((_, k) => `[m${k}]`).join("")}amix=inputs=${music.length + 1}:normalize=0:duration=first[au]`
  : ";[2:a]anull[au]";
const r = spawnSync(process.env.FFMPEG || "ffmpeg", [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", `color=c=0x05060A:s=${W}x${H}:r=30:d=${d}`,
  "-f", "lavfi", "-i", `color=c=0x3DF2FF:s=${W}x6:r=30:d=${d}`,
  "-i", "shots-preview-click.wav", ...musicIn,
  "-filter_complex", `[0:v]ass=shots-preview.ass[a];[a][1:v]overlay=x='-W+W*t/${d}':y=${H - 6}[v]${mix}`,
  "-map", "[v]", "-map", "[au]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-t", d, "shots-preview.mp4",
], { cwd: out, stdio: "inherit" }); // cwd = renders so the ass filter gets a path without a drive colon
if (r.status !== 0) { console.error("ffmpeg failed"); process.exit(1); }
console.log(`wrote video/renders/shots-preview.mp4 (${shots.length} shots, ${d} s, ${music.length ? "music: " + music.map((m) => m.file).join(", ") : "click track only"})`);
