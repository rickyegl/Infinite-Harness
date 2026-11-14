// The recorder's automatic cut: a whole run told in 20-30 s without a direction file.
//   graph shot  the run's events spread evenly over the shot (busy stretches get the time, idle hours vanish);
//               camera wide, then on each of the three busiest cells in the order they got busy, then wide again
//   wall shot   every published output, on the run's final state (left out when the run published nothing)

import type { GraphState, HarnessEvent } from "@harness/protocol";
import type { Shot, ShotData, Take } from "./data.ts";
import { TimeMap, type CamKey, type Direction } from "./direction.ts";

/** the cells with the most going on (steps, evidence, outputs, requests), busiest first, at most `n` */
export function busiest(events: readonly HarnessEvent[], final: GraphState, n = 3): string[] {
  const score = new Map<string, number>();
  const first = new Map<string, number>();
  for (const e of events) {
    const w = e.type === "node.evidence" || e.type === "node.output" ? 3 : e.type === "node.step" || e.type === "node.request" || e.type === "node.deliver" ? 1 : 0;
    if (!w || e.node === final.root || e.node === "assets" || !final.nodes[e.node]) continue;
    score.set(e.node, (score.get(e.node) ?? 0) + w);
    if (!first.has(e.node)) first.set(e.node, e.t);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([id]) => id);
}

/** beats of the shot -> take ms, so that every event gets the same share of the shot */
export function evenMap(events: readonly HarnessEvent[], beats: number): TimeMap {
  const ts = [...new Set(events.map((e) => e.t))].sort((a, b) => a - b);
  if (ts.length < 2) return new TimeMap([[0, ts[0] ?? 0], [beats, (ts[0] ?? 0) + 1]]);
  // at most ~64 points: one every k distinct times, plus the last
  const k = Math.max(1, Math.ceil(ts.length / 64));
  const picked = ts.filter((_, i) => i % k === 0);
  if (picked[picked.length - 1] !== ts[ts.length - 1]) picked.push(ts[ts.length - 1]);
  return new TimeMap(picked.map((t, i) => [(i / (picked.length - 1)) * beats, t]));
}

/**
 * The shots for a run of `durS` seconds (clamped to 20-30). `beatMs` is the stage grid's beat; the camera keys
 * are in beats.
 */
const SHOWN = /^(image|frames|video|model3d|link)$/;

/** what the wall shows: at most 12 outputs by name, the ones with a picture first, the latest of each name */
export function wallItems(final: GraphState, max = 12): string[] {
  const seen = new Set<string>();
  const outs = [...final.outputs].reverse().filter((o) => !seen.has(o.name) && seen.add(o.name));
  const shows = (o: (typeof outs)[number]) => SHOWN.test(o.kind) || final.nodes[o.node]?.evidence.some((e) => e.uri === o.uri && SHOWN.test(e.kind));
  return [...outs.filter(shows), ...outs.filter((o) => !shows(o))].slice(0, max).map((o) => o.name).reverse();
}

export function autoShots(take: Take, beatMs: number, durS = 24): ShotData[] {
  const total = Math.max(20, Math.min(30, durS)) * 1000;
  const hasWall = take.final.outputs.length > 0;
  const wallMs = hasWall ? Math.round(Math.min(6000, total * 0.22)) : 0;
  const graphMs = total - wallMs;
  const gBeats = graphMs / beatMs;
  // the events play over 85% of the graph shot; the rest holds on the finished graph
  const playBeats = gBeats * 0.85;
  const map = evenMap(take.events, playBeats);
  // one visit per third of the run: the busiest cell in that stretch, when it is busiest there (never before
  // it appears), so the camera follows the run instead of crowding into its last minutes
  const visits: { id: string; at: number }[] = [];
  for (let j = 0; j < 3; j++) {
    const lo = (j / 3) * playBeats, hi = ((j + 1) / 3) * playBeats;
    const inWin = take.events.filter((e) => {
      const b = map.inv(e.t);
      return b >= lo && b < hi && !visits.some((v) => v.id === e.node);
    });
    const [id] = busiest(inWin, take.final, 1);
    if (!id) continue;
    const mine = inWin.filter((e) => e.node === id).map((e) => map.inv(e.t));
    const born = map.inv(take.events.find((e) => e.node === id)!.t);
    visits.push({ id, at: Math.min(hi, Math.max(born + 1, mine[Math.floor(mine.length / 2)], lo + 2)) });
  }
  const camera: CamKey[] = [{ beat: 0, target: "all", dur: 0 }];
  for (const v of visits) camera.push({ beat: Math.max(1, v.at - 2), target: v.id, zoom: 0.55, dur: 2 });
  camera.push({ beat: Math.max((visits.at(-1)?.at ?? 0) + 2, Math.min(playBeats, gBeats - 3)), target: "all", dur: 3 });

  const shot = (id: string, view: Shot["view"], at: number, durMs: number): Shot => ({
    id, act: 0, bar: 0, beats: durMs / beatMs, view, source: "run", take: take.id, say: "", screen: "", camera: "", fx: "",
    startBeat: at / beatMs, start: at / 1000, end: (at + durMs) / 1000, dur: durMs / 1000,
  });
  const graphDir: Direction = { shot: "run:graph", draft: false, view: "graph", take: take.id, camera };
  const out: ShotData[] = [{ shot: shot("run:graph", "graph", 0, graphMs), dir: graphDir, take, map, at: 0, durMs: graphMs }];
  if (hasWall) {
    const items = wallItems(take.final);
    const wBeats = wallMs / beatMs;
    // every tile is in by 40% of the shot
    const stagger = Math.min(0.5, (wBeats * 0.4) / Math.max(1, items.length));
    const wallDir: Direction = { shot: "run:wall", draft: false, view: "wall", take: take.id, params: { items, stagger, push: 0.04 } };
    out.push({ shot: shot("run:wall", "wall", graphMs, wallMs), dir: wallDir, take, map: new TimeMap([[0, take.end], [wBeats, take.end + 1]]), at: graphMs, durMs: wallMs });
  }
  return out;
}
