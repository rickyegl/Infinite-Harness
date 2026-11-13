// Direction files (video/direction/<shot>.json): how one shot of the film reads its take.
// All positions are in beats from the shot's first beat; the take is addressed in its own ms.

export type ViewName = "prompt" | "graph" | "focus" | "split" | "wall" | "banner" | "rain" | "title";
export const VIEWS: readonly ViewName[] = ["prompt", "graph", "focus", "split", "wall", "banner", "rain", "title"];

export type CamTarget = "all" | string | string[];

export type CamKey = {
  /** beat (from shot start) at which this move starts */
  beat: number;
  /** "all", a node id / label path ("Unity > Karts"), or a list of them (their bounding box) */
  target: CamTarget;
  /** zoom multiplier on top of the fit; default 1 */
  zoom?: number;
  /** length of the move in beats; 0 = cut. Default 1 */
  dur?: number;
  /** GSAP ease name; default "power2.inOut" */
  ease?: string;
  /** offset in world px added after fitting */
  dx?: number;
  dy?: number;
};

export type Fx =
  | { type: "flash"; beat: number; dur?: number; color?: string }
  | { type: "shake"; beat: number; dur?: number; amp?: number }
  | { type: "punch"; beat: number; dur?: number; amount?: number }
  | { type: "fade"; beat: number; dur?: number; to?: "black" | "clear" }
  | { type: "blur"; beat: number; dur?: number; amount?: number };

export type Direction = {
  shot: string;
  /** true for files written by video/tools/direct.mjs; set false once hand-tuned (direct.mjs keeps those) */
  draft: boolean;
  view: ViewName;
  /** take id (video/takes/<take>/ or apps/web/fixtures/<take>.jsonl); none for pure ui shots */
  take?: string;
  /** extra takes merged into the same graph (rain view) */
  mergeTakes?: string[];
  /** piecewise-linear map shot beat -> take ms: [[beat, takeMs], ...], increasing in both */
  events?: { at: [number, number][] };
  camera?: CamKey[];
  /** node the view centres on (focus, banner, mini-graph highlight) */
  focus?: string;
  fx?: Fx[];
  /** view-specific settings; see STATUS.md "Direction files" */
  params?: Record<string, any>;
  note?: string;
};

/** Monotone piecewise-linear map and its inverse; past either end it extends the nearest segment's slope (a flat map stays flat). */
export class TimeMap {
  private pts: [number, number][];
  constructor(pts: [number, number][]) {
    this.pts = pts.length ? [...pts].sort((a, b) => a[0] - b[0]) : [[0, 0]];
  }
  /** x -> y */
  fwd(x: number): number {
    return interp(this.pts, x, 0, 1);
  }
  /** y -> x */
  inv(y: number): number {
    return interp(this.pts, y, 1, 0);
  }
}

function interp(p: [number, number][], v: number, a: 0 | 1, b: 0 | 1): number {
  if (p.length === 1) return p[0][b] + (v - p[0][a]);
  if (v <= p[0][a]) {
    // before the first point time runs 1:1 in the units of the first segment's slope
    return p[0][b] - (p[0][a] - v) * slope(p[0], p[1], a, b);
  }
  for (let i = 1; i < p.length; i++) {
    if (v <= p[i][a]) {
      const span = p[i][a] - p[i - 1][a];
      const f = span === 0 ? 1 : (v - p[i - 1][a]) / span;
      return p[i - 1][b] + f * (p[i][b] - p[i - 1][b]);
    }
  }
  const n = p.length - 1;
  return p[n][b] + (v - p[n][a]) * slope(p[n - 1], p[n], a, b);
}

function slope(p: [number, number], q: [number, number], a: 0 | 1, b: 0 | 1): number {
  const d = q[a] - p[a];
  return d === 0 ? 0 : (q[b] - p[b]) / d;
}

/** Shot-local clock: film ms in the shot <-> take ms. */
export type Timebase = {
  /** ms since the shot started (or since the live run started) */
  tau: number;
  /** take time the picture shows */
  takeT: number;
  /** ms of one beat */
  beatMs: number;
  /** display ms since a take-time instant happened (negative if it is in the future) */
  age(takeMs: number): number;
  /** shot-local ms of a beat */
  beat(b: number): number;
  mode: "live" | "director";
};

export function makeTimebase(tau: number, beatMs: number, map: TimeMap | null, mode: "live" | "director"): Timebase {
  if (!map) {
    return { tau, takeT: tau, beatMs, mode, age: (x) => tau - x, beat: (b) => b * beatMs };
  }
  // map is in beats -> take ms
  const takeT = map.fwd(tau / beatMs);
  return {
    tau, takeT, beatMs, mode,
    age: (x) => tau - map.inv(x) * beatMs,
    beat: (b) => b * beatMs,
  };
}
