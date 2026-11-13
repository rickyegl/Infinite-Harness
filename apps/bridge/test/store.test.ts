// Run store: append-only, restart-safe. A bridge that stops mid-run leaves a run marked running; the next
// start closes it as failed, with an error on every cell still open, and the log stays replayable.

import { reduce } from "@harness/protocol";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunStore } from "../src/store.ts";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "harness-store-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function halfRun(root: string, t0: number) {
  const store = new RunStore(root);
  const log = store.create("say hello three ways", t0);
  log.append({ type: "run.start", node: "root", prompt: "say hello three ways" }, 0);
  log.append({ type: "node.spawn", node: "root", parent: null, module: "harness", label: "Infinite Harness", kind: "root" }, 1);
  log.append({ type: "node.state", node: "root", state: "running" }, 2);
  log.append({ type: "node.spawn", node: "hello", parent: "root", module: "mock.agent", label: "Hello", kind: "agent" }, 300);
  log.append({ type: "node.state", node: "hello", state: "running" }, 301);
  log.append({ type: "node.spawn", node: "hello.a", parent: "hello", module: "agent", label: "English", kind: "agent" }, 900);
  log.append({ type: "node.done", node: "hello.a", summary: "Hello" }, 1500);
  return { id: log.meta.id, store };
}

describe("run store", () => {
  it("assigns increasing seq and keeps t monotone", () => {
    const root = tmp();
    const { id, store } = halfRun(root, Date.now());
    const ev = store.events(id);
    expect(ev.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 1; i < ev.length; i++) expect(ev[i].t).toBeGreaterThanOrEqual(ev[i - 1].t);
  });

  it("closes an interrupted run on restart: open cells fail, the log replays", () => {
    const root = tmp();
    const t0 = Date.now() - 10000;
    const { id } = halfRun(root, t0);

    // the bridge "restarts": a new store over the same folder
    const again = new RunStore(root);
    expect(again.recover(t0 + 5000)).toEqual([id]);
    expect(again.meta(id)?.state).toBe("failed");

    const ev = again.events(id);
    const errs = ev.filter((e) => e.type === "node.error").map((e) => e.node);
    expect(errs.sort()).toEqual(["hello", "root"]);
    expect(ev.at(-1)?.type).toBe("run.done");
    expect(new Set(ev.map((e) => e.seq)).size).toBe(ev.length);
    expect(ev.at(-1)!.t).toBeGreaterThanOrEqual(5000);

    const s = reduce(ev);
    expect(s.nodes.hello.state).toBe("failed");
    expect(s.nodes["hello.a"].state).toBe("done");
    expect(s.doneAt).not.toBeNull();

    // a second restart has nothing left to close
    expect(new RunStore(root).recover()).toEqual([]);
  });

  it("drops a torn last line left by a crash", () => {
    const root = tmp();
    const { id, store } = halfRun(root, Date.now());
    appendFileSync(join(store.dir(id), "events.jsonl"), '{"seq":8,"t":1600,"type":"node.st');
    const again = new RunStore(root);
    expect(again.events(id)).toHaveLength(7);
    again.recover();
    const ev = again.events(id);
    expect(ev[7].seq).toBe(8);
    expect(ev.at(-1)?.type).toBe("run.done");
  });

  it("reopens a finished run for a follow-up and keeps counting seq", () => {
    const root = tmp();
    const { id, store } = halfRun(root, Date.now());
    store.recover();
    const n = store.events(id).length;
    const log = store.reopen(id);
    const e = log.append({ type: "node.step", node: "root", title: "Follow-up" });
    expect(e.seq).toBe(n + 1);
    expect(store.meta(id)?.state).toBe("running");
  });
});
