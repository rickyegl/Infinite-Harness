#!/usr/bin/env node
// Resolves video/shots.json (bars + beats) against video/beats.json (real timings)
// into video/timeline.json (seconds) and regenerates the table in video/SHOTS.md.
// No dependencies. Usage: node video/tools/resolve.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(root, f), "utf8"));
const { meta, shots, rain } = read("shots.json");
const grid = read("beats.json");
const bpb = grid.beatsPerBar ?? 4;
const problems = [];

// beat index (0-based, may run past the list) -> seconds
function beatTime(i) {
  if (Array.isArray(grid.beats)) {
    const b = grid.beats;
    if (i < b.length) return b[i];
    const step = b[b.length - 1] - b[b.length - 2]; // extrapolate with the last interval
    return b[b.length - 1] + step * (i - b.length + 1);
  }
  return (grid.offset ?? 0) + (i * 60) / grid.bpm;
}

let expected = 0;
const rows = shots.map((s) => {
  const startBeat = (s.bar - 1) * bpb + ((s.beat ?? 1) - 1);
  if (startBeat !== expected) problems.push(`${s.id}: starts at beat ${startBeat}, previous shot ends at ${expected}`);
  expected = startBeat + s.beats;
  const start = beatTime(startBeat);
  const end = beatTime(startBeat + s.beats);
  const words = s.say.replace(/\[[^\]]*\]/g, "x").split(/\s+/).filter(Boolean).length;
  const wps = words ? words / (end - start) : 0;
  if (wps > 4.2) problems.push(`${s.id}: ${wps.toFixed(1)} words/s is too fast to say ("${s.say}")`);
  return { ...s, startBeat, start: +start.toFixed(3), end: +end.toFixed(3), dur: +(end - start).toFixed(3), words, wps: +wps.toFixed(2) };
});

const total = rows.at(-1).end - beatTime(0);
const drift = total - meta.targetSeconds;
if (Math.abs(drift) > 1.5) {
  const elastic = rows.filter((r) => r.elastic).map((r) => r.id).join(", ");
  problems.push(`film runs ${total.toFixed(1)} s vs target ${meta.targetSeconds} s (${drift > 0 ? "+" : ""}${drift.toFixed(1)} s). Add or remove bars in elastic shots: ${elastic}`);
}

const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const esc = (x) => String(x ?? "").replace(/\|/g, "\\|");
const table = [
  "| Shot | Bars | Time | View | Module | Voice line | On screen | Camera / FX | Source | Take |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => {
    const lastBar = r.bar + Math.ceil(r.beats / bpb) - 1;
    const bars = lastBar === r.bar ? `${r.bar}` : `${r.bar}-${lastBar}`;
    const camfx = [r.camera, r.fx].filter(Boolean).join(" ");
    return `| ${r.id} | ${bars} | ${mmss(r.start)}-${mmss(r.end)} | ${r.view} | ${esc(r.module)} | ${esc(r.say ? `"${r.say}"` : "")} | ${esc(r.screen)} | ${esc(camfx)} | ${r.source}${r.elastic ? " (elastic)" : ""} | ${esc(r.take)} |`;
  }),
].join("\n");

const check = process.argv.includes("--check");
if (!check) {
  writeFileSync(join(root, "timeline.json"), JSON.stringify({ grid, total: +total.toFixed(3), shots: rows, rain }, null, 2) + "\n");
  const mdPath = join(root, "SHOTS.md");
  const md = readFileSync(mdPath, "utf8");
  const a = "<!-- shots:start -->", b = "<!-- shots:end -->";
  if (!md.includes(a) || !md.includes(b)) problems.push("SHOTS.md is missing the shots:start / shots:end markers");
  else writeFileSync(mdPath, md.slice(0, md.indexOf(a) + a.length) + "\n" + table + "\n" + md.slice(md.indexOf(b)));
}

const spoken = rows.filter((r) => r.words);
console.log(`${rows.length} shots, ${expected} beats (${expected / bpb} bars), ${total.toFixed(1)} s, ${spoken.reduce((n, r) => n + r.words, 0)} spoken words in ${spoken.length} lines`);
if (problems.length) {
  console.log("\nPROBLEMS:\n" + problems.map((p) => " - " + p).join("\n"));
  process.exit(1);
}
console.log(check ? "ok" : "ok: wrote video/timeline.json and the table in video/SHOTS.md");
