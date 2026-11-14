// The harness side of the Roblox place. The project lives at paths.robloxProject (runs/.game/roblox): a Rojo
// project copied from modules/game.roblox/template. The cells write three generated modules into
// src/shared (Config.luau from the design, TrackData.luau from the Unity editor's track_export, Flags.luau for the
// live follow-ups) and the Build cell lints with selene and builds place.rbxlx with rojo.
//
// The place is not opened in Studio here: there are no Studio captures, so the evidence is drawn from the
// same data the place is built from (track top view and height profile, grid, rider, reach, HUD layout) plus
// the Luau that was written.

import type { ModuleContext } from "@harness/protocol";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = resolve(HERE, "..", "template");
const REPO = resolve(HERE, "..", "..", "..");
const SHARED = join("src", "shared");

export const robloxProject = (config: Record<string, any>) => resolve(REPO, config.paths?.robloxProject ?? "runs/.game/roblox");

/** a Roblox tool: paths.<name>, else the aftman shim, else PATH */
export function tool(config: Record<string, any>, name: "rojo" | "selene"): string {
  const own = config.paths?.[name];
  if (own && existsSync(own)) return own;
  const shim = join(homedir(), ".aftman", "bin", process.platform === "win32" ? `${name}.exe` : name);
  return existsSync(shim) ? shim : name;
}

export function hasTool(config: Record<string, any>, name: "rojo" | "selene"): boolean {
  const r = spawnSync(tool(config, name), ["--version"], { cwd: TEMPLATE, encoding: "utf8", windowsHide: true });
  return r.status === 0;
}

// ---------- Luau literals ----------

const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;
const luauStr = (s: string) =>
  '"' +
  Array.from(s)
    .map((c) => {
      if (c === "\\" || c === '"') return "\\" + c;
      if (c === "\n") return "\\n";
      const code = c.codePointAt(0)!;
      return code < 0x20 || code > 0x7e ? `\\u{${code.toString(16)}}` : c;
    })
    .join("") +
  '"';

/** a JSON value as a Luau literal; long number arrays wrap at 12 per line */
export function luau(v: unknown, ind = ""): string {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "boolean") return String(v);
  // whole numbers as they are: rounding a 15-digit asset id through v * 1e4 would add a stray fraction
  if (typeof v === "number") return !Number.isFinite(v) ? "0" : Number.isInteger(v) ? String(v) : String(Math.round(v * 1e4) / 1e4);
  if (typeof v === "string") return luauStr(v);
  const next = ind + "\t";
  if (Array.isArray(v)) {
    if (!v.length) return "{}";
    if (v.every((x) => typeof x === "number")) {
      const rows: string[] = [];
      for (let i = 0; i < v.length; i += 12) rows.push(next + v.slice(i, i + 12).map((x) => luau(x)).join(", ") + ",");
      return v.length <= 12 ? `{ ${v.map((x) => luau(x)).join(", ")} }` : `{\n${rows.join("\n")}\n${ind}}`;
    }
    return `{\n${v.map((x) => next + luau(x, next) + ",").join("\n")}\n${ind}}`;
  }
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, x]) => `${next}${ident.test(k) ? k : `[${luauStr(k)}]`} = ${luau(x, next)},`).join("\n")}\n${ind}}`;
}

// ---------- the project ----------

export type TrackData = { width: number; points: number[]; ups: number[]; hover: number[]; features: { kind: string; from: number; to: number }[] };

export class Place {
  constructor(public project: string, private config: Record<string, any>) {}

  private get configJson() {
    return join(this.project, "harness-config.json");
  }
  private get flagsJson() {
    return join(this.project, "harness-flags.json");
  }

  /** copies the template over the project (keeps nothing generated from an earlier run) */
  reset(): void {
    mkdirSync(this.project, { recursive: true });
    rmSync(join(this.project, "src"), { recursive: true, force: true });
    cpSync(TEMPLATE, this.project, { recursive: true });
    for (const f of [this.configJson, this.flagsJson, join(this.project, "track.json")]) rmSync(f, { force: true });
  }

  readConfig(): Record<string, any> {
    return existsSync(this.configJson) ? JSON.parse(readFileSync(this.configJson, "utf8")) : {};
  }

  /** merges top-level sections (built merges key by key) and rewrites Config.luau */
  patchConfig(patch: Record<string, any>): Record<string, any> {
    const c = this.readConfig();
    for (const [k, v] of Object.entries(patch)) c[k] = k === "built" ? { ...(c.built ?? {}), ...v } : v;
    writeFileSync(this.configJson, JSON.stringify(c, null, 2));
    this.writeModule("Config", "The game design, written by the engine cells from design.json (generated).", c);
    return c;
  }

  readFlags(): Record<string, any> {
    return existsSync(this.flagsJson) ? JSON.parse(readFileSync(this.flagsJson, "utf8")) : {};
  }

  /** live flags (night, realistic, musicId, relay, relayUrl); bumps version and rewrites Flags.luau */
  patchFlags(patch: Record<string, unknown>): Record<string, any> {
    const f: Record<string, any> = { night: false, realistic: false, musicId: "", relay: false, relayUrl: "", ...this.readFlags(), ...patch };
    f.version = (Number(f.version) || 0) + 1;
    writeFileSync(this.flagsJson, JSON.stringify(f, null, 2));
    const { music: _m, musicFile: _f, ...luauFlags } = f;
    this.writeModule("Flags", "Live follow-ups rewrite this file and rebuild the place (generated).", luauFlags);
    return f;
  }

  writeTrack(data: TrackData): void {
    writeFileSync(join(this.project, "track.json"), JSON.stringify(data));
    this.writeModule("TrackData", "The centre line from the Unity editor's track_export: metres, Unity axes (generated).", data);
  }

  readTrack(): TrackData | null {
    const f = join(this.project, "track.json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  }

  private writeModule(name: string, comment: string, value: unknown): void {
    const file = join(this.project, SHARED, `${name}.luau`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `-- ${comment}\nreturn ${luau(value)}\n`);
  }

  source(rel: string): string {
    return readFileSync(join(this.project, rel), "utf8");
  }

  /** selene over src; returns errors, warnings and the tail of the report */
  lint(): { errors: number; warnings: number; report: string } {
    const r = spawnSync(tool(this.config, "selene"), ["--display-style", "quiet", "src"], { cwd: this.project, encoding: "utf8", windowsHide: true });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (r.error) throw new Error(`selene: ${r.error.message}`);
    const errors = (out.match(/: error\[/g) ?? []).length;
    const warnings = (out.match(/: warning\[/g) ?? []).length;
    if (r.status !== 0 && !errors) throw new Error(`selene failed: ${out.trim().split("\n").slice(-3).join(" ")}`);
    return { errors, warnings, report: out.trim() };
  }

  /** rojo build -o place.rbxlx; returns the file, its size and the seconds it took */
  build(): { file: string; bytes: number; seconds: number } {
    const file = join(this.project, "place.rbxlx");
    const t0 = Date.now();
    const r = spawnSync(tool(this.config, "rojo"), ["build", "-o", file], { cwd: this.project, encoding: "utf8", windowsHide: true });
    if (r.status !== 0) throw new Error(`rojo build: ${`${r.stdout}${r.stderr}`.trim().split("\n").slice(-3).join(" ")}`);
    return { file, bytes: statSync(file).size, seconds: (Date.now() - t0) / 1000 };
  }
}

export const placeFor = (ctx: ModuleContext) => new Place(robloxProject(ctx.config), ctx.config);

// ---------- code evidence ----------

/** lines of a Luau file as code evidence rows ("+" for the generated ones) */
export function codeLines(text: string, max = 30, op = "+"): [string, string][] {
  const rows = text.replace(/\t/g, "  ").split(/\r?\n/).filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim()));
  const out = rows.slice(0, max).map((l) => [op, l.length > 96 ? l.slice(0, 95) + "…" : l] as [string, string]);
  if (rows.length > max) out.push([" ", `… ${rows.length - max} more lines`]);
  return out;
}

/** the lines of a source file between two markers (first line containing `from`, up to `to`) */
export function excerpt(text: string, from: string, to: string): string {
  const lines = text.split(/\r?\n/);
  const a = lines.findIndex((l) => l.includes(from));
  if (a < 0) return "";
  const b = lines.findIndex((l, i) => i > a && l.includes(to));
  return lines.slice(a, b < 0 ? a + 30 : b + 1).join("\n");
}

// ---------- drawings from the place's own data ----------

const BG = "#0b0e16";
const INK = "#e8ecf4";
const DIM = "#7c8599";
const ROAD = "#9aa3b5";
const HOVER = "#50e6ff";
const FEATURE: Record<string, string> = { loop: "#ff6b9a", twist: "#ffd23c", drop: "#7cf29a", bank: "#b98cff" };

const svgDoc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Segoe UI, Helvetica, Arial, sans-serif"><rect width="${w}" height="${h}" fill="${BG}"/>${body}</svg>`;
const text = (x: number, y: number, s: string, size = 22, fill = INK, anchor = "start", weight = 600) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;

function pts(t: TrackData) {
  const out: { x: number; y: number; z: number; hover: number }[] = [];
  for (let i = 0; i < t.points.length / 3; i++) out.push({ x: t.points[i * 3], y: t.points[i * 3 + 1], z: t.points[i * 3 + 2], hover: t.hover[i] ?? 0 });
  return out;
}

function lengths(p: { x: number; y: number; z: number }[]) {
  const cum = [0];
  for (let i = 1; i <= p.length; i++) {
    const a = p[i - 1], b = p[i % p.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return cum;
}

/** the centre line from above, hover sections glowing, features labelled, start marked */
export function trackTopSvg(t: TrackData, title: string): string {
  const W = 1280, H = 720, pad = 70;
  const p = pts(t);
  const xs = p.map((q) => q.x), zs = p.map((q) => q.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const s = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2 - 40) / (maxZ - minZ || 1));
  const ox = W / 2 - ((minX + maxX) / 2) * s, oz = H / 2 + 20 + ((minZ + maxZ) / 2) * s;
  const X = (q: { x: number }) => ox + q.x * s, Y = (q: { z: number }) => oz - q.z * s;
  const segs: string[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const hov = a.hover > 0.5;
    segs.push(`<line x1="${X(a).toFixed(1)}" y1="${Y(a).toFixed(1)}" x2="${X(b).toFixed(1)}" y2="${Y(b).toFixed(1)}" stroke="${hov ? HOVER : ROAD}" stroke-width="${Math.max(4, t.width * s).toFixed(1)}" stroke-linecap="round" opacity="${hov ? 1 : 0.85}"/>`);
  }
  const labels = t.features.map((f) => {
    const mid = p[Math.floor((f.from + f.to) / 2) % p.length];
    const c = FEATURE[f.kind] ?? INK;
    return `<circle cx="${X(mid).toFixed(1)}" cy="${Y(mid).toFixed(1)}" r="9" fill="${c}"/>` + text(X(mid) + 14, Y(mid) - 12, f.kind, 20, c);
  });
  const st = p[0];
  const cum = lengths(p);
  const legend = [text(pad, 48, `${title}: the lap from above`, 26), text(W - pad, 48, `${Math.round(cum[p.length])} m lap, ${t.width} m wide`, 20, DIM, "end", 500), `<rect x="${W - pad - 300}" y="${H - 44}" width="22" height="8" fill="${HOVER}"/>`, text(W - pad - 270, H - 36, "hover sections", 18, DIM, "start", 500), `<rect x="${W - pad - 120}" y="${H - 44}" width="22" height="8" fill="${ROAD}"/>`, text(W - pad - 90, H - 36, "road", 18, DIM, "start", 500)];
  return svgDoc(W, H, segs.join("") + labels.join("") + `<rect x="${(X(st) - 8).toFixed(1)}" y="${(Y(st) - 8).toFixed(1)}" width="16" height="16" fill="#fff" stroke="#000" stroke-width="2"/>` + text(X(st) + 14, Y(st) + 26, "start", 18) + legend.join(""));
}

/** height along the lap, with features shaded */
export function trackProfileSvg(t: TrackData): string {
  const W = 1280, H = 720, padL = 90, padR = 50, top = 110, bottom = 90;
  const p = pts(t);
  const cum = lengths(p);
  const L = cum[p.length];
  const ys = p.map((q) => q.y);
  const lo = Math.min(0, ...ys), hi = Math.max(...ys, lo + 1);
  const X = (d: number) => padL + (d / L) * (W - padL - padR);
  const Y = (y: number) => H - bottom - ((y - lo) / (hi - lo)) * (H - top - bottom);
  const bands = t.features.map((f) => {
    const a = X(cum[f.from] ?? 0), b = X(cum[Math.min(f.to, p.length)] ?? L);
    const c = FEATURE[f.kind] ?? INK;
    return `<rect x="${a.toFixed(1)}" y="${top - 30}" width="${Math.max(3, b - a).toFixed(1)}" height="${H - top - bottom + 30}" fill="${c}" opacity="0.13"/>` + text((a + b) / 2, top - 38, f.kind, 18, c, "middle");
  });
  const line = p.map((q, i) => `${i ? "L" : "M"}${X(cum[i]).toFixed(1)},${Y(q.y).toFixed(1)}`).join("") + `L${X(L).toFixed(1)},${Y(p[0].y).toFixed(1)}`;
  const area = `${line}L${X(L).toFixed(1)},${Y(lo)}L${X(0).toFixed(1)},${Y(lo)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => text(X(f * L), H - bottom + 30, `${Math.round(f * L)} m`, 16, DIM, "middle", 500));
  const yt = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#222a3a"/>` + text(padL - 12, Y(v) + 6, `${Math.round(v)} m`, 16, DIM, "end", 500));
  return svgDoc(W, H, text(padL, 48, "Height along the lap", 26) + yt.join("") + bands.join("") + `<path d="${area}" fill="${ROAD}" opacity="0.12"/><path d="${line}" fill="none" stroke="${HOVER}" stroke-width="3"/>` + ticks.join(""));
}

/** the starting grid from above: kart footprints in their colours, two per row behind the line */
export function gridSvg(karts: { count: number; colors: string[]; names: string[] }, widthM: number): string {
  const W = 1280, H = 720;
  const n = Math.min(12, karts.count);
  const road = 360, hw = road / 2, cx = W / 2;
  const scale = road / widthM;
  const body: string[] = [`<rect x="${cx - hw}" y="70" width="${road}" height="${H - 110}" fill="#2e323c"/>`];
  body.push(`<rect x="${cx - hw - 12}" y="70" width="12" height="${H - 110}" fill="#d83c3c"/><rect x="${cx + hw}" y="70" width="12" height="${H - 110}" fill="#d83c3c"/>`);
  for (let c = 0; c < 10; c++) for (let r = 0; r < 2; r++) body.push(`<rect x="${cx - hw + c * (road / 10)}" y="${120 + r * 10}" width="${road / 10}" height="10" fill="${(c + r) % 2 ? "#111" : "#fff"}"/>`);
  // the place's sizes: a kart is 4 x 6 studs, rows are 14 studs apart, at 3 studs per metre
  const rows = Math.ceil(n / 2);
  const k = Math.min(scale, (H - 230) / (rows * 14 / 3));
  const kw = (4 / 3) * k, kl = (6 / 3) * k, gap = (14 / 3) * k;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const x = cx + (i % 2 === 0 ? -1 : 1) * hw * 0.4;
    const y = 140 + (row + 1) * gap - kl / 2;
    const color = karts.colors[i % Math.max(1, karts.colors.length)] ?? "#ccc";
    body.push(`<rect x="${(x - kw / 2).toFixed(1)}" y="${(y - kl / 2).toFixed(1)}" width="${kw.toFixed(1)}" height="${kl.toFixed(1)}" rx="6" fill="${color}"/>`);
    body.push(text(x + (i % 2 === 0 ? -kw / 2 - 14 : kw / 2 + 14), y + 7, `${i + 1}. ${karts.names[i] ?? `Kart ${i + 1}`}`, 20, INK, i % 2 === 0 ? "end" : "start"));
  }
  return svgDoc(W, H, text(60, 48, `Starting grid: ${n} karts`, 26) + body.join(""));
}

/** a rider on the kart from the side, with the design's weapon, drawn from the same part sizes as the place */
/** the four rider classes side by side, drawn from the part sizes in the place, each with its class gear */
export const CLASS_GEAR: Record<string, { name: string; color: string; cooldown: number; attack: string }> = {
  volt: { name: "Volt", color: "#3cd6ff", cooldown: 4, attack: "SPACE: electric dash, zaps on contact" },
  sniper: { name: "Sniper", color: "#ff3c5a", cooldown: 10, attack: "mouse crosshair, click to shoot" },
  shrink: { name: "Shrink", color: "#c45cff", cooldown: 9, attack: "SPACE: small and fast, a touch squashes" },
  thrower: { name: "Thrower", color: "#ffb23c", cooldown: 3, attack: "throws an item forward on its own" },
};

export function classesSvg(r: { height: number; skin: string }, kartColors: string[]): string {
  const W = 1280, H = 720, s = 30, gy = 470; // 1 stud = s px, ground at gy
  const h = Math.min(1.4, Math.max(0.7, r.height));
  const out: string[] = [];
  Object.entries(CLASS_GEAR).forEach(([kind, c], i) => {
    const gx = 160 + i * 320; // kart centre; the kart faces left (-Z), so +Z (back) is to the right
    const P = (z: number, y: number) => [gx + z * s, gy - y * s];
    const box = (z: number, y: number, w: number, hh: number, fill: string, rx = 4) => {
      const [px, py] = P(z - w / 2, y + hh / 2);
      return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(w * s).toFixed(1)}" height="${(hh * s).toFixed(1)}" rx="${rx}" fill="${fill}"/>`;
    };
    const circ = (z: number, y: number, d: number, fill: string, op = 1) => {
      const [px, py] = P(z, y);
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${((d * s) / 2).toFixed(1)}" fill="${fill}" opacity="${op}"/>`;
    };
    const kc = kartColors[i % Math.max(1, kartColors.length)] ?? "#e8463c";
    const top = 3.4 + 1.75 * h;
    out.push(
      box(0, 1.3, 6, 1.2, kc), box(-3.9, 1.15, 1.8, 0.9, kc), box(2.8, 2.7, 1.1, 0.25, "#1e1e22"), box(0.9, 2.2, 1.6, 1.4, "#1e1e22"),
      circ(-2, 0.85, 1.7, "#161618"), circ(2, 0.85, 1.7, "#161618"),
      box(0.6, 3.4, 1 * h, 2 * h, kc), circ(0.6, top, 1.4 * h, r.skin), circ(0.65, top + 0.15, 1.55 * h, kc, 0.55),
      box(-0.2, 3.2, 1.8 * h, 0.6 * h, r.skin),
    );
    const g = c.color;
    if (kind === "volt") out.push(box(1.45, 3.5, 1.1, 1.4, "#383842"), circ(1.45, 4.6, 1, g), box(0.6, top + 1, 0.15, 0.9, "#383842"), circ(0.4, 2.6, 0.8, g), circ(-0.7, 2.7, 0.8, g));
    else if (kind === "sniper") out.push(box(-1.2, 2.9, 3.2, 0.35, "#383842"), box(0.6, 2.8, 1.2, 0.6, "#6e4626"), box(-0.6, 3.3, 1, 0.45, "#383842"), circ(-1.15, 3.3, 0.35, g), box(-0.15, top + 0.1, 0.2, 0.3, g));
    else if (kind === "shrink") out.push(circ(0.2, 2.5, 1.1, "#ffffff", 0.45), circ(0.2, 2.5, 0.8, g), box(0.2, 3.15, 0.35, 0.4, "#383842"), box(0.65, top + 1, 0.15, 0.5, "#383842"), box(0.65, top + 1.3, 1.8, 0.1, g));
    else out.push(box(1.45, 3.3, 0.8, 1.5, "#734d29"), circ(1.45, 4.2, 0.7, g), circ(0.4, 2.5, 1, g));
    out.push(
      text(gx, 150, c.name, 30, g, "middle", 800),
      text(gx, 184, `every ${c.cooldown} s`, 18, DIM, "middle", 500),
      text(gx, gy + 60, c.attack, 16, INK, "middle", 500),
    );
  });
  return svgDoc(W, H, text(60, 48, "Four rider classes, each with its own attack", 26) + `<line x1="40" x2="${W - 40}" y1="${gy}" y2="${gy}" stroke="#2a3244" stroke-width="3"/>` + out.join("") + text(W - 60, H - 40, "drawn to scale from the part sizes in the place; a generated rider model replaces the parts once uploaded", 18, DIM, "end", 500));
}

/** what each class's attack does, with the numbers the server uses */
export function attacksSvg(c: { slow: number; knock: number; aiAggression: number }): string {
  const W = 1280, H = 720;
  const keep = (x: number) => `keeps ${Math.round(x * 100)}% speed`;
  const rows: [string, string, string, string][] = [
    ["volt", "Electric dash", "0.7 s at 1.55x top speed", `zap on contact: ${keep(c.slow)}, ${c.knock.toFixed(0)} m/s shove, 0.8 s spin`],
    ["sniper", "Crosshair shot", "150 m range, 1.8 m aim radius", `${keep(c.slow * 0.75)}, half shove, 1 s spin`],
    ["shrink", "Shrink", "4 s at 55% size and 1.3x top speed", `touched while small: squashed, ${keep(0.25)}, 1.2 s spin`],
    ["thrower", "Thrown item", "flies 22 m/s faster than the kart for 2.2 s", `first kart in its lane: ${keep(c.slow + (1 - c.slow) * 0.3)}, 0.6 s spin`],
  ];
  const body = rows.map(([k, title, how, hit], i) => {
    const y = 170 + i * 120;
    const g = CLASS_GEAR[k];
    return (
      `<rect x="60" y="${y - 46}" width="${W - 120}" height="100" rx="14" fill="#151a26"/><rect x="60" y="${y - 46}" width="10" height="100" rx="4" fill="${g.color}"/>` +
      text(100, y - 6, `${g.name}: ${title}`, 26, g.color, "start", 800) +
      text(100, y + 30, `every ${g.cooldown} s, ${how}`, 19, INK, "start", 500) +
      text(W - 90, y + 30, hit, 19, DIM, "end", 500)
    );
  });
  return svgDoc(W, H, text(60, 64, "Combat: four attacks, all checked on the server", 26) + body.join("") + text(W - 60, H - 30, `AI riders attack after the first 3 s of the race (aggression ${c.aiAggression.toFixed(1)})`, 18, DIM, "end", 500));
}

/** the HUD layout at 1280x720 with the real minimap from the track */
export function hudSvg(hud: { title: string; accent: string; minimap: boolean }, t: TrackData | null, laps: number, names: string[] = []): string {
  const W = 1280, H = 720;
  const body: string[] = [`<rect width="${W}" height="${H}" fill="#3d6a8f"/><rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="#3d6b35"/><path d="M${W * 0.42},${H * 0.55} L${W * 0.58},${H * 0.55} L${W * 0.86},${H} L${W * 0.14},${H} Z" fill="#34373f"/>`];
  body.push(text(24, 46, hud.title.toUpperCase(), 30, hud.accent, "start", 900));
  body.push(text(24, 98, `LAP 1/${laps}`, 40, INK, "start", 900));
  body.push(text(W - 24, 82, "2nd", 64, hud.accent, "end", 900));
  body.push(text(W - 24, H - 34, "142 km/h", 44, INK, "end", 900));
  body.push(text(24, 150, `${names[0] ?? "Kart 1"} sniped ${names[2] ?? "Kart 3"}!`, 20, INK, "start", 700));
  body.push(text(W / 2, H - 50, "SNIPER   READY", 26, CLASS_GEAR.sniper.color, "middle", 900));
  body.push(text(W / 2, H - 14, "W/S drive  |  A/D steer  |  MOUSE aim  |  CLICK shoot", 18, "#cfd5e2", "middle", 500));
  // the crosshair over a kart ahead
  body.push(`<rect x="${W * 0.56}" y="${H * 0.6}" width="44" height="30" rx="6" fill="${names.length ? "#3c8ee8" : "#888"}"/><circle cx="${W * 0.56 + 22}" cy="${H * 0.6 + 12}" r="19" fill="none" stroke="#ff3c50" stroke-width="3"/><circle cx="${W * 0.56 + 22}" cy="${H * 0.6 + 12}" r="3" fill="#ff3c50"/>`);
  if (hud.minimap && t) {
    const m = 190, x0 = 24, y0 = H - m - 24;
    body.push(`<rect x="${x0}" y="${y0}" width="${m}" height="${m}" fill="#0a0c12" opacity="0.55"/>`);
    const p = pts(t);
    const xs = p.map((q) => q.x), zs = p.map((q) => -q.z);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
    const k = (m - 24) / span, cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2;
    for (let i = 0; i < p.length; i += 2) body.push(`<rect x="${(x0 + m / 2 + (p[i].x - cx) * k - 1.5).toFixed(1)}" y="${(y0 + m / 2 + (-p[i].z - cz) * k - 1.5).toFixed(1)}" width="3" height="3" fill="#c8cdd7"/>`);
    const me = p[Math.floor(p.length * 0.1)];
    body.push(`<circle cx="${(x0 + m / 2 + (me.x - cx) * k).toFixed(1)}" cy="${(y0 + m / 2 + (-me.z - cz) * k).toFixed(1)}" r="6.5" fill="${hud.accent}"/>`);
  }
  return svgDoc(W, H, body.join(""));
}

export function writeSvg(ctx: ModuleContext, name: string, svg: string): string {
  const f = join(ctx.dir, name);
  mkdirSync(ctx.dir, { recursive: true });
  writeFileSync(f, svg);
  return f;
}
