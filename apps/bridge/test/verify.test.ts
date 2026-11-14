// The Verifier end to end, offline: a test asset cell makes a texture, the texture is deleted, and the Verifier
// marks that cell failed, sends it one fix (node.request to it, the cell runs again in place, node.deliver back),
// checks again and marks it passed.

import { reduce, type HarnessEvent } from "@harness/protocol";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridge, type Bridge } from "../src/bridge.ts";
import { config, merge, type HarnessConfig } from "../src/config.ts";

let b: Bridge;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "harness-verify-"));
  const cfg = merge<HarnessConfig>(config(), {
    bridge: { port: 0, runsDir: join(dir, "runs"), tokenFile: join(dir, "runs", ".bridge-token") },
    // mock off: the Verifier runs its run.ts (in mock mode it would replay its fixture); mock.asset is a plain script
    mock: { enabled: false, speed: 40 },
  });
  b = await createBridge(cfg);
});
afterAll(async () => {
  await b?.close();
  rmSync(dir, { recursive: true, force: true });
});

const events = (runDir: string): HarnessEvent[] =>
  readFileSync(join(runDir, "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("verifier", () => {
  it("marks a cell whose file is gone, sends one fix, checks again", async () => {
    const a = b.runner.cell(null, "mock.asset", { prompt: "a striped test texture", params: { kind: "image" } });
    expect(await a.done).not.toBeNull();
    const runDir = a.run.log.dir;
    const tex = join(runDir, "artifacts", "asset", "texture.png");
    expect(existsSync(tex)).toBe(true);
    unlinkSync(tex);

    const v = b.runner.cell(a.run.id, "verify", { prompt: "make no mistakes" });
    const out = await v.done;
    expect(out?.summary).toMatch(/all pass \(1 after one fix\)/);
    expect(existsSync(tex)).toBe(true);

    const ev = events(runDir);
    const at = (pred: (e: HarnessEvent) => boolean) => ev.findIndex(pred);
    const failed = at((e) => e.type === "node.step" && e.node === "asset" && e.icon === "alert" && /texture\.png is missing/.test(e.detail ?? ""));
    const asked = at((e) => e.type === "node.request" && e.node === "verify" && e.to === "asset");
    const delivered = at((e) => e.type === "node.deliver" && e.node === "asset" && e.to === "verify");
    const passed = at((e) => e.type === "node.step" && e.node === "asset" && e.icon === "check" && e.title === "Checked after the fix");
    expect(failed).toBeGreaterThan(-1);
    expect(asked).toBeGreaterThan(failed);
    expect(delivered).toBeGreaterThan(asked);
    expect(passed).toBeGreaterThan(delivered);
    // exactly one fix
    expect(ev.filter((e) => e.type === "node.request").length).toBe(1);

    const g = reduce(ev);
    expect(g.nodes.asset.state).toBe("done");
    expect(g.nodes.verify.state).toBe("done");
    expect(g.doneAt).not.toBeNull();
  }, 120_000);

  it("passes a good cell without a fix", async () => {
    const a = b.runner.cell(null, "mock.asset", { prompt: "a card" });
    expect(await a.done).not.toBeNull();
    const v = b.runner.cell(a.run.id, "verify", { prompt: "check it" });
    expect((await v.done)?.summary).toBe("1 cell checked, all pass");
    expect(events(a.run.log.dir).some((e) => e.type === "node.request")).toBe(false);
  }, 120_000);

  it("reports honestly when the one fix does not help", async () => {
    const a = b.runner.cell(null, "mock.asset", { prompt: "a texture", params: { kind: "image" } });
    expect(await a.done).not.toBeNull();
    const runDir = a.run.log.dir;
    unlinkSync(join(runDir, "artifacts", "asset", "texture.png"));
    // the cell will be asked again without "image", so the fix makes the card only and the texture stays missing
    writeFileSync(join(runDir, "inputs", "asset.json"), JSON.stringify({ prompt: "a texture" }));
    const v = b.runner.cell(a.run.id, "verify", { prompt: "check it" });
    expect(await v.done).toBeNull();
    const ev = events(runDir);
    expect(ev.filter((e) => e.type === "node.request").length).toBe(1);
    expect(ev.some((e) => e.type === "node.step" && e.node === "asset" && e.title === "Still failing after one fix")).toBe(true);
    const err = ev.find((e) => e.type === "node.error" && e.node === "verify");
    expect(err && "message" in err ? err.message : "").toMatch(/1 of 1 cells still fail: Test asset: texture\.png is missing/);
  }, 120_000);
});
