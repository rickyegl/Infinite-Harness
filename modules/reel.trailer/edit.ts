// The trailer's edit, worked out from the track's beat grid the way trailers/HOW_TO.md does it by hand: splice the
// song on beats so the drop lands at ~43% of the trailer and a big hit (the logo) at ~85%, cut on every beat
// group 30 ms early, accelerate (4-beat cuts, a slow dim build, the drop with a full flash, 2-beat cuts, 1-beat
// flashes, a slow-motion hero shot, the logo over a dimmed shot), and caption it in the channel's style.
// Pure functions: run.ts writes the result as the `head.py` the studio's render engine is prepended with.

export type Bar = { t: number; e: number };
export type Beats = { beat: number; phase: number; double: { beat: number; phase: number }; bars: Bar[] };
export type Role = "start" | "loop" | "twist";
export type Clip = { key: string; role: Role; seconds: number };
export type Shot = { t0: number; t1: number; src: string; ss: number; sp?: number; cx?: number; cy?: number; z?: number; z2?: number; fl?: number; pu?: number; dim?: number };
export type Text = { t0: number; t1: number; lines: string[]; y: number; size: number; color: "white" | "yellow" | "red" };
export type Edit = {
  dur: number;
  beat: number;
  segs: [number, number, number][];
  xf: number[];
  drop: number;
  hit: number;
  shots: Shot[];
  texts: Text[];
  /** cut times in the trailer, and the song's energy per trailer bar (for the beat-grid chart) */
  cuts: number[];
  energy: number[];
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const LEAD = 0.03;

/** reads `beats.py` output: BEAT, PHASE, the double-time grid and the energy per 4-beat bar */
export function parseBeats(out: string): Beats {
  const num = (re: RegExp) => {
    const m = re.exec(out);
    if (!m) throw new Error(`the beat finder printed no ${re.source}`);
    return Number(m[1]);
  };
  const beat = num(/^BEAT = ([\d.]+)/m);
  const phase = num(/^PHASE = ([\d.]+)/m);
  const dm = /double-time: BEAT = ([\d.]+) .*PHASE = ([\d.]+)/.exec(out);
  const bars = [...out.matchAll(/^\s*\d+\s+([\d.]+)\s+#*\s+([\d.]+)\s*$/gm)].map((m) => ({ t: Number(m[1]), e: Number(m[2]) }));
  if (bars.length < 6) throw new Error("the track is too short to cut a trailer to (fewer than 6 bars)");
  return { beat, phase, double: dm ? { beat: Number(dm[1]), phase: Number(dm[2]) } : { beat: beat / 2, phase }, bars };
}

/** the drop: the bar after bar 2 whose energy jumps most above the two bars before it (and is above the median) */
export function dropOf(bars: Bar[]): number {
  const med = [...bars.map((b) => b.e)].sort((a, b) => a - b)[Math.floor(bars.length / 2)];
  let best = -Infinity;
  let at = Math.min(4, bars.length - 1);
  for (let i = 2; i < bars.length - 2; i++) {
    const jump = bars[i].e - (bars[i - 1].e + bars[i - 2].e) / 2;
    if (bars[i].e >= med && jump > best) {
      best = jump;
      at = i;
    }
  }
  return bars[at].t;
}

export type Words = { title: string; loops: number; twists: number; karts: number; platform: string };

/**
 * The edit for a `dur`-second trailer over `songSeconds` of music. Clips are the gameplay recordings (roles say
 * where on the lap each starts). Throws when the song cannot hold the trailer.
 */
export function planEdit(b: Beats, songSeconds: number, dur: number, clips: Clip[], words: Words): Edit {
  if (!clips.length) throw new Error("no gameplay clips to cut");
  // the beat to cut on: the double-time grid for slow tracks, so cuts are ~0.3-0.6 s apart
  const B = 60 / b.beat < 100 ? b.double.beat : b.beat;
  const k = 1; // beats per count: the recipe cuts 4 / 2 / 1 beats on the grid chosen above
  const dropSong = dropOf(b.bars);
  let nDrop = Math.round((0.43 * dur) / B);
  if (dropSong - nDrop * B < 0) nDrop = Math.floor(dropSong / B);
  const s0 = r3(dropSong - nDrop * B);
  let nHit = Math.round((0.85 * dur) / B);
  if (s0 + nHit * B > songSeconds - 0.1) nHit = Math.floor((songSeconds - 0.1 - s0) / B);
  if (nHit * B < dur * 0.6 || nDrop < 6 * k) throw new Error(`the track is too short for a ${dur} s trailer (its drop is at ${dropSong.toFixed(1)} s of ${songSeconds.toFixed(1)} s)`);
  const g = (n: number) => r3(n * B);
  const c = (t: number) => r3(Math.max(0, t - LEAD));
  const cut = (n: number) => (n === 0 ? 0 : c(g(n)));
  const HIT = g(nHit);
  const DROP = g(nDrop);
  const tailSong = dropSong + (dur - HIT) + 0.1;
  const segs: [number, number, number][] = [[s0, r3(s0 + HIT), 0]];
  if (tailSong <= songSeconds) segs.push([r3(dropSong), r3(tailSong), HIT]);
  else segs[0][1] = r3(Math.min(songSeconds, s0 + dur)); // no room for the reprise: let the song run on
  const xf = segs.map((_, i) => (i ? 0.06 : 0));

  // gameplay sources: a cursor per clip so no stretch is used twice until a clip wraps
  const byRole = (r: Role) => clips.find((x) => x.role === r) ?? clips[0];
  const cursor = new Map(clips.map((x) => [x.key, 0.6]));
  const take = (clip: Clip, len: number, at?: number): number => {
    const need = len + 0.3;
    let ss = at ?? cursor.get(clip.key)!;
    if (ss + need > clip.seconds) ss = Math.max(0, Math.min(0.6 + ((ss * 7.3) % Math.max(0.1, clip.seconds - need - 0.6)), clip.seconds - need));
    if (at === undefined) cursor.set(clip.key, ss + need + 0.2);
    return r3(ss);
  };
  const shots: Shot[] = [];
  const add = (n0: number, n1: number, clip: Clip, o: Omit<Shot, "t0" | "t1" | "src" | "ss"> = {}, at?: number) => {
    const t0 = cut(n0);
    const t1 = n1 === Infinity ? dur : cut(n1);
    shots.push({ t0, t1, src: clip.key, ss: take(clip, (t1 - t0) * (o.sp ?? 1), at), ...o });
  };
  const start = byRole("start");
  const loop = byRole("loop");
  const twist = byRole("twist");
  // intro: 4-count cuts alternating the start and the twist, the last one stretched to the build
  const intro: number[] = [];
  for (let n = 0; n < nDrop - 4 * k; n += 4 * k) intro.push(n);
  intro.forEach((n0, i) => {
    const n1 = i + 1 < intro.length ? intro[i + 1] : nDrop - 4 * k;
    add(n0, n1, i % 2 ? twist : start, { cy: 0.5, z: 1.12, z2: 1.24, fl: i ? 0.3 : 0, pu: i ? 0.05 : 0 });
  });
  // build: slower, dimmer, creeping in
  add(nDrop - 4 * k, nDrop, start, { sp: 0.8, cy: 0.5, z: 1.15, z2: 1.38, dim: 0.88 });
  // the drop: the loop (or the clip's start) with a full flash and a punch-in
  add(nDrop, nDrop + 4 * k, loop, { cy: 0.5, z: 1.25, z2: 1.12, fl: 1.0, pu: 0.12 }, Math.min(1.2, Math.max(0, loop.seconds - 3)));
  // action: 2-count cuts round the clips, every fourth hit harder
  const all = [loop, twist, start];
  let i = 0;
  let n = nDrop + 4 * k;
  for (; n + 2 * k <= nHit - 6 * k; n += 2 * k, i++) add(n, n + 2 * k, all[i % all.length], { cy: 0.5, z: 1.18 + (i % 3) * 0.06, fl: i % 4 === 3 ? 0.8 : 0.4, pu: i % 4 === 3 ? 0.1 : 0.06 });
  // 1-count flashes
  for (; n + k <= nHit - 3 * k; n += k, i++) add(n, n + k, all[i % all.length], { cy: 0.5, z: 1.3, fl: 0.6, pu: 0.08 });
  // hero: half speed, pushing in
  add(n, nHit, loop, { sp: 0.5, cy: 0.5, z: 1.2, z2: 1.5, fl: 1.0, pu: 0.12 });
  // the logo over a dimmed, slowly widening shot
  add(nHit, Infinity, start, { sp: 0.7, cy: 0.5, z: 1.3, z2: 1.1, fl: 1.0, dim: 0.45 });

  // captions on the same counts (vertical frame coordinates; the wide cut maps them)
  const TB = (n0: number, n1: number, lines: string[], size: number, color: Text["color"] = "white", y = 1250): Text => ({ t0: n0 === 0 ? 0.08 : r3(c(g(n0)) + 0.05), t1: r3(c(g(n1)) - 0.04), lines, size, color, y });
  const texts: Text[] = [];
  const introCaps: [string[], number, Text["color"]][] = [
    [["ONE PROMPT"], 120, "white"],
    [["A WHOLE", "RACING GAME"], 112, "yellow"],
    [words.loops || words.twists ? [words.loops ? `${words.loops} LOOP${words.loops > 1 ? "S" : ""}` : "", words.twists ? `${words.twists} TWIST${words.twists > 1 ? "S" : ""}` : ""].filter(Boolean) : [`${words.karts} KARTS`], 112, "white"],
  ];
  intro.forEach((n0, j) => {
    if (j < introCaps.length) texts.push(TB(n0, j + 1 < intro.length ? intro[j + 1] : nDrop - 4 * k, ...introCaps[j]));
  });
  texts.push(TB(nDrop - 4 * k, nDrop, ["GET READY..."], 96));
  texts.push(TB(nDrop, nDrop + 4 * k, ["RACE!"], 150, "red"));
  const a0 = nDrop + 6 * k;
  if (a0 + 8 * k <= nHit - 6 * k) texts.push(TB(a0, a0 + 8 * k, ["PICK YOUR", "RIDER"], 110, "white", 1300));
  if (a0 + 20 * k <= nHit - 3 * k) texts.push(TB(a0 + 12 * k, a0 + 20 * k, ["VOLT. SNIPER.", "SHRINK. THROWER."], 92, "yellow", 1300));
  texts.push({ t0: r3(c(HIT) + 1.6), t1: dur, lines: ["PLAY NOW", words.platform], y: 1180, size: 118, color: "yellow" });

  // the chart: song energy per trailer bar, cut times
  const songAt = (t: number) => (segs.length > 1 && t >= HIT ? dropSong + (t - HIT) : s0 + t);
  const barLen = 4 * b.beat;
  const energy: number[] = [];
  for (let t = 0; t < dur; t += barLen) {
    const st = songAt(t);
    const bar = b.bars.reduce((best, x) => (Math.abs(x.t - st) < Math.abs(best.t - st) ? x : best), b.bars[0]);
    energy.push(Math.round(bar.e * 100) / 100);
  }
  return { dur, beat: B, segs, xf, drop: DROP, hit: HIT, shots, texts, cuts: shots.map((s) => s.t0), energy };
}

const COLORS: Record<Text["color"], string> = { white: "(255, 255, 255)", yellow: "(255, 222, 60)", red: "(255, 90, 90)" };
const py = (v: unknown) => JSON.stringify(v);

export type Frame = { w: number; h: number };
export const VERTICAL: Frame = { w: 1080, h: 1920 };
export const WIDE: Frame = { w: 1920, h: 1080 };

/** caption and logo placement for a frame: vertical as the recipe has it, wide scaled into the lower third */
function place(t: Text, f: Frame): { y: number; size: number } {
  if (f.h > f.w) return { y: t.y, size: t.size };
  return { y: t.lines[0] === "PLAY NOW" ? 860 : 830, size: Math.round(t.size * 0.66) };
}

/** the `head.py` the studio's `render_tail.py` is appended to (the same variables its example head defines) */
export function headPy(e: Edit, o: { frame: Frame; music: string; out: string; font: string; logo: string; src: Record<string, string>; size: Record<string, [number, number]> }): string {
  const f = o.frame;
  const wide = f.w > f.h;
  const shot = (s: Shot) =>
    `S(${s.t0}, ${s.t1}, ${py(s.src)}, ${s.ss}` +
    (["sp", "cx", "cy", "z", "z2", "fl", "pu", "dim"] as const).filter((k) => s[k] !== undefined).map((k) => `, ${k}=${s[k]}`).join("") +
    ")";
  const text = (t: Text) => {
    const p = place(t, f);
    return `T(${t.t0}, ${t.t1}, ${py(t.lines)}, y=${p.y}, size=${p.size}, color=${COLORS[t.color]})`;
  };
  return [
    `"""Generated by the harness trailer cell from the track's beat grid (see trailers/HOW_TO.md). Appended to render_tail.py."""`,
    "import glob, math, os, subprocess, sys",
    "import numpy as np, cv2",
    "from PIL import Image, ImageDraw, ImageFont, ImageFilter",
    "SP = os.path.dirname(os.path.abspath(__file__))",
    `MUSIC = ${py(o.music)}`,
    `OUT = ${py(o.out)}`,
    `FONT = ${py(o.font)}; LOGO = ${py(o.logo)}`,
    `W, H, FPS = ${f.w}, ${f.h}, 30`,
    `DUR = ${e.dur}`,
    `SRC = ${py(o.src)}`,
    `SIZE = {${Object.entries(o.size).map(([k, [w, h]]) => `${py(k)}: (${w}, ${h})`).join(", ")}}`,
    `SEGS = [${e.segs.map(([a, b, c]) => `(${a}, ${b}, ${c})`).join(", ")}]`,
    `XF = ${py(e.xf)}`,
    `FADE_A = (${r3(e.dur - 1.6)}, ${e.dur})`,
    `BEAT = ${e.beat}`,
    `DROP = ${e.drop}`,
    `HIT = ${e.hit}`,
    `LEAD = ${LEAD}`,
    "def S(t0, t1, src, ss, sp=1.0, cx=0.5, cx2=None, cy=0.45, z=1.22, z2=None, fl=0.0, pu=0.0, dim=1.0):",
    "    return dict(t0=t0, t1=t1, src=src, ss=ss, sp=sp, cx=cx, cx2=cx if cx2 is None else cx2, cy=cy,",
    "                z=z, z2=z * 1.06 if z2 is None else z2, fl=fl, pu=pu, dim=dim)",
    "SHOTS = [",
    ...e.shots.map((s) => `    ${wide ? shot({ ...s, z: 1 + ((s.z ?? 1.22) - 1) * 0.5, z2: s.z2 === undefined ? undefined : 1 + (s.z2 - 1) * 0.5 }) : shot(s)},`),
    "]",
    `WHITEOUT = [${r3(e.hit - LEAD)}]`,
    "def T(t0, t1, lines, y=1250, size=100, color=(255, 255, 255), pop=True):",
    "    return dict(t0=t0, t1=t1, lines=lines, y=y, size=size, color=color, pop=pop)",
    "TEXTS = [",
    ...e.texts.map((t) => `    ${text(t)},`),
    "]",
    `LOGO_T = ${r3(e.hit - LEAD)}`,
    wide ? "LOGO_W, LOGO_Y = 1000, 420" : "LOGO_W, LOGO_Y = 960, 820",
    `FADE_OUT = (${r3(e.dur - 1.1)}, DUR)`,
    "",
  ].join("\n");
}
