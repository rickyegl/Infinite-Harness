import type { HarnessEvent } from "@harness/protocol";
import { describe, expect, it } from "vitest";
import { autoShots, busiest, evenMap } from "./autocut.ts";
import { makeTake } from "./data.ts";

const beatMs = 468.75;
let seq = 0;
const ev = (t: number, node: string, p: Record<string, unknown>) => ({ seq: ++seq, t, run: "r", node, ...p }) as unknown as HarnessEvent;

function run(): HarnessEvent[] {
  seq = 0;
  const out: HarnessEvent[] = [
    ev(0, "root", { type: "run.start", prompt: "p" }),
    ev(0, "root", { type: "node.spawn", parent: null, module: "root", label: "Root", kind: "root" }),
  ];
  for (const [id, n] of [["a", 2], ["b", 9], ["c", 5], ["d", 7]] as const) {
    out.push(ev(10, id, { type: "node.spawn", parent: "root", module: "m", label: id, kind: "tool" }));
    // b is busy late, after a long idle gap: the even map should still give it screen time
    const start = id === "b" ? 3_600_000 : 100;
    for (let k = 0; k < n; k++) out.push(ev(start + k * 50, id, { type: "node.step", title: `s${k}` }));
    out.push(ev(start + n * 50, id, { type: "node.done", summary: "ok" }));
  }
  out.push(ev(3_700_000, "d", { type: "node.output", name: "Out", uri: "x.png", kind: "image" }));
  out.push(ev(3_700_001, "root", { type: "run.done" }));
  return out;
}

describe("autocut", () => {
  it("finds the three busiest cells", () => {
    const events = run();
    const take = makeTake("r", events, "/", false);
    expect(busiest(events, take.final)).toEqual(["d", "b", "c"]);
  });

  it("spreads the events evenly, so an idle hour takes no screen time", () => {
    const m = evenMap(run(), 100);
    // the hour-long gap between the early cells and b sits between two neighbouring events
    const before = m.inv(400), after = m.inv(3_600_000);
    expect(after - before).toBeLessThan(10);
    expect(m.fwd(0)).toBe(0);
    expect(m.fwd(100)).toBe(3_700_001);
  });

  it("cuts a 24 s film: graph with camera moves, then the wall", () => {
    const take = makeTake("r", run(), "/", false);
    const shots = autoShots(take, beatMs, 24);
    expect(shots.map((s) => s.dir.view)).toEqual(["graph", "wall"]);
    expect(shots.reduce((n, s) => n + s.durMs, 0)).toBe(24000);
    const cams = shots[0].dir.camera!;
    expect(cams[0].target).toBe("all");
    expect(cams.at(-1)!.target).toBe("all");
    // one cell per third of the run, in time order, each after it appears; the late busy cell is among them
    const visits = cams.slice(1, -1);
    expect(visits.length).toBe(3);
    expect(new Set(visits.map((c) => c.target)).size).toBe(3);
    expect(visits.map((c) => c.target)).toContain("b");
    const beats = cams.map((c) => c.beat);
    expect([...beats].sort((a, b) => a - b)).toEqual(beats);
    const born = (id: string) => shots[0].map!.inv(take.events.find((e) => e.node === id)!.t);
    for (const v of visits) expect(v.beat + 2).toBeGreaterThan(born(v.target as string));
    // clamped to 20-30 s
    expect(autoShots(take, beatMs, 90).reduce((n, s) => n + s.durMs, 0)).toBe(30000);
  });
});
