import { describe, expect, it } from "vitest";
import {
  ancestors, checkEvent, checkManifest, descendants, findNode, latestEvidence, parseJsonl, reduce,
  type HarnessEvent,
} from "../src/index.ts";

let seq = 0;
const ev = (t: number, node: string, p: Record<string, unknown>): HarnessEvent =>
  ({ seq: seq++, t, run: "r1", node, ...p }) as HarnessEvent;

seq = 0;
const log: HarnessEvent[] = [
  ev(0, "root", { type: "run.start", prompt: "make a game" }),
  ev(0, "root", { type: "node.spawn", parent: null, module: "root", label: "Harness", kind: "root" }),
  ev(100, "game", { type: "node.spawn", parent: "root", module: "game", label: "Game", kind: "orchestrator" }),
  ev(150, "game", { type: "node.state", state: "running" }),
  ev(200, "unity", { type: "node.spawn", parent: "game", module: "game.unity", label: "Unity", kind: "orchestrator" }),
  ev(250, "karts", { type: "node.spawn", parent: "unity", module: "game.unity.karts", label: "Karts", kind: "agent" }),
  ev(260, "image", { type: "node.spawn", parent: "root", module: "assets.image", label: "Image", kind: "tool", maker: "m1" }),
  ev(300, "karts", { type: "node.step", title: "open scene" }),
  ev(400, "karts", { type: "node.evidence", kind: "image", uri: "artifacts/a.png", caption: "first" }),
  ev(450, "karts", { type: "node.request", to: "image", what: "kart model", requestId: "q1" }),
  ev(500, "karts", { type: "node.evidence", kind: "code", uri: "artifacts/b.diff" }),
  ev(600, "image", { type: "node.deliver", to: "karts", requestId: "q1", uri: "artifacts/kart.glb" }),
  ev(700, "karts", { type: "node.output", name: "Build", uri: "artifacts/build.zip", kind: "link", href: "https://x" }),
  ev(800, "karts", { type: "node.done", summary: "karts ok" }),
  ev(850, "image", { type: "node.error", message: "quota" }),
  ev(900, "ghost", { type: "node.step", title: "never spawned" }),
  ev(1000, "root", { type: "run.done" }),
];

describe("reduce", () => {
  it("is empty before the first event", () => {
    const s = reduce([], 1000);
    expect(s.order).toEqual([]);
    expect(s.root).toBeNull();
    expect(s.prompt).toBeNull();
  });

  it("builds the tree with depths and children in spawn order", () => {
    const s = reduce(log);
    expect(s.root).toBe("root");
    expect(s.prompt).toBe("make a game");
    expect(s.order).toEqual(["root", "game", "unity", "karts", "image"]);
    expect(s.nodes.root.children).toEqual(["game", "image"]);
    expect(s.nodes.karts.depth).toBe(3);
    expect(s.nodes.image.maker).toBe("m1");
    expect(s.nodes.game.maker).toBeUndefined();
  });

  it("only applies events with t <= t", () => {
    const s = reduce(log, 250);
    expect(s.order).toEqual(["root", "game", "unity", "karts"]);
    expect(s.nodes.game.state).toBe("running");
    expect(s.nodes.karts.state).toBe("queued");
    expect(s.nodes.karts.steps).toEqual([]);
    expect(s.lastT).toBe(250);
    expect(reduce(log, 300).nodes.karts.steps.map((x) => x.title)).toEqual(["open scene"]);
  });

  it("tracks a request in flight and its delivery", () => {
    const mid = reduce(log, 550);
    expect(mid.flights).toEqual([{ requestId: "q1", from: "karts", to: "image", what: "kart model", firedAt: 450 }]);
    const after = reduce(log, 600).flights[0];
    expect(after.deliveredAt).toBe(600);
    expect(after.uri).toBe("artifacts/kart.glb");
  });

  it("records evidence, outputs, done and error", () => {
    const s = reduce(log);
    expect(latestEvidence(s.nodes.karts)?.uri).toBe("artifacts/b.diff");
    expect(latestEvidence(s.nodes.karts, "image")?.caption).toBe("first");
    expect(s.outputs.map((o) => o.name)).toEqual(["Build"]);
    expect(s.nodes.karts.outputs[0].href).toBe("https://x");
    expect(s.nodes.karts).toMatchObject({ state: "done", summary: "karts ok", doneAt: 800 });
    expect(s.nodes.image).toMatchObject({ state: "failed", error: "quota" });
    expect(s.doneAt).toBe(1000);
  });

  it("ignores events for nodes that were never spawned", () => {
    expect(reduce(log).nodes.ghost).toBeUndefined();
  });

  it("is pure: same input gives equal output and the input is not mutated", () => {
    const shuffled = [...log].reverse();
    const copy = JSON.stringify(shuffled);
    expect(reduce(shuffled, 700)).toEqual(reduce(log, 700));
    expect(JSON.stringify(shuffled)).toBe(copy);
    expect(reduce(log, 640)).toEqual(reduce(log, 640));
  });

  it("does not leave undefined keys on records", () => {
    const step = reduce(log).nodes.karts.steps[0];
    expect(Object.keys(step).sort()).toEqual(["seq", "t", "title"]);
  });
});

describe("queries", () => {
  const s = reduce(log);
  it("descendants and ancestors", () => {
    expect(descendants(s, "root")).toEqual(["game", "unity", "karts", "image"]);
    expect(ancestors(s, "karts")).toEqual(["unity", "game", "root"]);
  });
  it("findNode by id, label and label path", () => {
    expect(findNode(s, "karts")?.id).toBe("karts");
    expect(findNode(s, "Karts")?.id).toBe("karts");
    expect(findNode(s, "Unity > Karts")?.id).toBe("karts");
    expect(findNode(s, "Game > Karts")?.id).toBe("karts");
    expect(findNode(s, "Image > Karts")).toBeUndefined();
  });
});

describe("parse and check", () => {
  it("parses jsonl and reports the bad line", () => {
    const text = log.map((e) => JSON.stringify(e)).join("\n") + "\n\n";
    expect(parseJsonl(text)).toHaveLength(log.length);
    expect(() => parseJsonl('{"seq":0,"t":0,"run":"r","node":"n","type":"nope"}')).toThrow(/line 1: unknown type/);
    expect(() => parseJsonl("\n{oops")).toThrow(/line 2: not JSON/);
  });
  it("checks required fields", () => {
    expect(checkEvent({ seq: 1, t: 0, run: "r", node: "n", type: "node.step" })).toMatch(/title/);
    expect(checkEvent(log[2])).toBeNull();
  });
  it("checks manifests, including the maker rule", () => {
    const m = {
      id: "assets.image", label: "Image", icon: "image", kind: "tool", maker: "m1", summary: "s",
      accepts: ["text"], produces: ["image"], runtime: "script", mock: true, allow: {},
    };
    expect(checkManifest(m)).toBeNull();
    expect(checkManifest({ ...m, kind: "agent" })).toMatch(/maker/);
  });
});
