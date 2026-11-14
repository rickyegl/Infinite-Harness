// Plan 05: the pure parts of the reel modules (voice presets, the script gate, approve, motion's brief reading,
// publish's table) and publish's dry run against the real studio schedulers: it must report the dry-run marker
// and leave the studio's catalog and post lists untouched (its sockets are blocked inside plan.py, so a planner
// that tried the network would fail the run instead of posting).

import type { HarnessEvent } from "@harness/protocol";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../src/config.ts";
import { approve, hashOf, waiting, type Wait } from "../../../modules/_shared/gate.ts";
import { inSubtree, pick } from "../../../modules/approve/run.ts";
import { resolutionOf, secondsOf } from "../../../modules/motion/run.ts";
import { MARKER, tableLines, type Entry } from "../../../modules/publish/run.ts";
import { cacheKey, presetOf } from "../../../modules/voice/run.ts";
import { briefsOf } from "../../../modules/campaign/run.ts";
import { opensRight } from "../../../modules/reel.premise/run.ts";
import { VERTICAL, WIDE, dropOf, headPy, parseBeats, planEdit } from "../../../modules/reel.trailer/edit.ts";

const tmp = mkdtempSync(join(tmpdir(), "reels-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("voice presets", () => {
  const cfg = { voice: { presets: { premise: { voice: "v1", fx: "A", speed: 1.15 }, empty: { voice: "<voice id>", fx: "none" } } } };
  it("reads a preset and refuses a placeholder", () => {
    expect(presetOf(cfg, "premise")).toMatchObject({ name: "premise", voice: "v1", fx: "A", speed: 1.15 });
    expect(presetOf(cfg, undefined)).toBeNull();
    expect(() => presetOf(cfg, "empty")).toThrow(/not set/);
    expect(() => presetOf(cfg, "missing")).toThrow(/not set/);
  });
  it("keys the cache by text and preset, and keeps the default voice's old key", () => {
    const p = presetOf(cfg, "premise");
    expect(cacheKey("hi", p)).not.toBe(cacheKey("hi", null));
    expect(cacheKey("hi", p)).not.toBe(cacheKey("hi there", p));
    expect(cacheKey("hi", null)).toBe(cacheKey("hi", null));
  });
});

describe("script gate", () => {
  it("binds the go to the script text", () => {
    expect(hashOf("a line\r\n")).toBe(hashOf("a line"));
    expect(hashOf("a line")).not.toBe(hashOf("another line"));
  });
  it("writes a go with the hash of the script as it is now", () => {
    const run = join(tmp, "run");
    const script = join(tmp, "script.txt");
    writeFileSync(script, "In this world, karts race.");
    const w: Wait = { node: "n1", label: "Premise", script, hash: hashOf("old"), at: "" };
    mkdirSync(join(run, "approvals"), { recursive: true });
    writeFileSync(join(run, "approvals", "n1.wait"), JSON.stringify(w));
    expect(waiting(run).map((x) => x.node)).toEqual(["n1"]);
    approve(run, w);
    const go = JSON.parse(readFileSync(join(run, "approvals", "n1.go"), "utf8"));
    expect(go.hash).toBe(hashOf("In this world, karts race."));
  });
});

describe("approve", () => {
  const w = (node: string, label: string): Wait => ({ node, label, script: "", hash: "", at: "" });
  const waits = [w("campaign.explainer", "Explainer"), w("campaign.premise", "Premise reel"), w("other", "Explainer")];
  const ev = (node: string, parent: string | null) => ({ type: "node.spawn", node, parent, module: "m", label: "m" }) as unknown as HarnessEvent;
  const events = [ev("campaign", null), ev("campaign.explainer", "campaign"), ev("campaign.premise", "campaign"), ev("other", null)];
  it("keeps the waits under its parent", () => {
    expect(inSubtree(events, "campaign", waits).map((x) => x.node)).toEqual(["campaign.explainer", "campaign.premise"]);
    expect(inSubtree(events, null, waits)).toHaveLength(3);
  });
  it("picks by name, takes both on 'both', and lists when unsure", () => {
    const mine = waits.slice(0, 2);
    expect(pick("The explainer script looks good, go.", mine).map((x) => x.node)).toEqual(["campaign.explainer"]);
    expect(pick("go on both", mine)).toHaveLength(2);
    expect(pick("go", mine)).toHaveLength(2);
    expect(pick("go", mine.slice(0, 1))).toHaveLength(1);
  });
});

describe("motion brief", () => {
  it("reads a length and a shape", () => {
    expect(secondsOf("title card that says READY")).toBe(3);
    expect(secondsOf("a 5-second count-up")).toBe(5);
    expect(secondsOf("x", { seconds: 8 })).toBe(8);
    expect(resolutionOf("title card")).toBe("landscape");
    expect(resolutionOf("a vertical 9:16 card")).toBe("portrait");
    expect(resolutionOf("a short story card")).toBe("landscape");
    expect(resolutionOf("x", { resolution: "square" })).toBe("square");
  });
});

describe("publish dry run", () => {
  const entry: Entry = { platform: "TikTok", account: "dev_en", stem: "Clip", post_at: "2026-11-15T13:00-06:00", status: "ready", note: "", caption: "" };
  it("draws one line per post", () => {
    expect(tableLines([entry])).toEqual(["TikTok dev_en: Clip, 2026-11-15 13:00, ready"]);
  });

  const studio = config().paths?.studio as string | undefined;
  const tools = studio ? join(studio, "shared", "tools") : "";
  it.skipIf(!studio || !existsSync(join(tools, "tt_schedule.py")))("plans offline and writes nothing in the studio", () => {
    const watched = ["catalog.csv", "tiktok_posts.csv", "instagram_posts.csv"].map((f) => join(studio!, f)).filter(existsSync);
    const before = watched.map((f) => statSync(f).mtimeMs);
    const list = join(tmp, "reels.json");
    writeFileSync(list, JSON.stringify([
      { generator: "explainers", project: "Harness_Test", file: join(tmp, "HarnessTestExplainer.mp4"), title: "How one prompt builds a game" },
      { generator: "premise", project: "Harness_Test", file: join(tmp, "HarnessTestPremise.mp4"), title: "In this world, karts race" },
    ]));
    const py = (config().paths?.python as string | undefined) || "python";
    const r = spawnSync(py, [resolve(import.meta.dirname, "../../../modules/publish/plan.py"), list], {
      cwd: tools, encoding: "utf8", timeout: 60_000, env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
    });
    expect(r.status, r.stderr).toBe(0);
    const plan = JSON.parse(r.stdout.trim().split(/\r?\n/).pop()!);
    expect(plan.mode).toBe(MARKER);
    expect(plan.entries.some((e: Entry) => e.stem === "HarnessTestExplainer" && e.post_at)).toBe(true);
    expect(watched.map((f) => statSync(f).mtimeMs)).toEqual(before);
  });
});

describe("trailer edit", () => {
  const B = 0.46875;
  const P = 0.05;
  const rows = Array.from({ length: 40 }, (_, i) => `${String(i).padStart(3)}  ${(P + i * 4 * B).toFixed(2).padStart(6)}  ##########  ${(i >= 8 && i < 30 ? 0.8 : 0.3).toFixed(2)}`);
  const out = [`BEAT = ${B}   # 128.0 BPM`, `PHASE = ${P}`, `double-time: BEAT = ${B / 2} (256.0 BPM), PHASE = ${P}   <- use this`, "", "bar  time    energy", ...rows].join("\n");
  const clips = [{ key: "A", role: "start", seconds: 12 }, { key: "B", role: "loop", seconds: 12 }, { key: "C", role: "twist", seconds: 12 }] as const;
  const words = { title: "Zapwick Rush", loops: 2, twists: 2, karts: 8, platform: "ON PC" };

  it("reads the beat finder and finds the drop", () => {
    const b = parseBeats(out);
    expect(b.beat).toBeCloseTo(B);
    expect(b.double.beat).toBeCloseTo(B / 2);
    expect(b.bars).toHaveLength(40);
    expect(dropOf(b.bars)).toBeCloseTo(P + 8 * 4 * B, 2);
    expect(() => parseBeats(out.split("\n").slice(0, 8).join("\n"))).toThrow(/too short/);
  });

  it("cuts end to end on the beat, inside each clip, with the drop on the song's drop", () => {
    const b = parseBeats(out);
    const e = planEdit(b, 75, 30, [...clips], words);
    expect(e.shots[0].t0).toBe(0);
    expect(e.shots.at(-1)?.t1).toBeCloseTo(30, 2);
    for (let i = 1; i < e.shots.length; i++) expect(e.shots[i].t0).toBeCloseTo(e.shots[i - 1].t1, 3);
    for (const s of e.shots) expect(s.ss + (s.t1 - s.t0) * (s.sp ?? 1)).toBeLessThanOrEqual(12.01);
    expect(e.shots.length).toBeGreaterThan(15);
    // the first song segment carries the song's drop to the trailer's drop
    const [s0, , at0] = e.segs[0];
    expect(dropOf(b.bars) - s0 + at0).toBeCloseTo(e.drop, 2);
    for (const [a, z] of e.segs) expect(a >= 0 && z <= 75 && z > a).toBe(true);
    const lines = e.texts.map((t) => t.lines.join(" "));
    expect(lines).toContain("RACE!");
    expect(lines.at(-1)).toBe("PLAY NOW ON PC");
    for (const t of e.texts) expect(t.t0 >= 0 && t.t1 <= 30 && t.t1 > t.t0).toBe(true);
  });

  it("writes a head for each aspect", () => {
    const e = planEdit(parseBeats(out), 75, 30, [...clips], words);
    const o = { music: "m.wav", out: "o.mp4", font: "f.ttf", logo: "l.png", src: { A: "a.mp4", B: "b.mp4", C: "c.mp4" }, size: { A: [1920, 1080], B: [1920, 1080], C: [1920, 1080] } as Record<string, [number, number]> };
    expect(headPy(e, { ...o, frame: VERTICAL })).toMatch(/^W, H, FPS = 1080, 1920, 30$/m);
    const wide = headPy(e, { ...o, frame: WIDE });
    expect(wide).toMatch(/^W, H, FPS = 1920, 1080, 30$/m);
    expect(wide).toMatch(/^DUR = 30$/m);
  });
});

describe("premise and campaign", () => {
  it("knows a premise opening", () => {
    expect(opensRight("# Title: Faster...\nIn this world, whenever you *brake*, you win.")).toBe(true);
    expect(opensRight("# Title: x\nWhenever you brake, you win.")).toBe(false);
  });

  it("fills briefs the worker missed and keeps the ones it wrote", () => {
    const b = briefsOf([{ audience: "Roblox players", angle: "Race your friends.", headline: "RACE. FIGHT.", cta: "Play free" }], ["unity", "roblox"], "Zapwick Rush");
    expect(b.map((x) => x.audience)).toEqual(["unity", "roblox"]);
    expect(b[1]).toMatchObject({ who: "Roblox players", headline: "RACE. FIGHT.", cta: "Play free" });
    expect(b[0].headline.length).toBeGreaterThan(0);
    expect(briefsOf("nonsense", ["roblox"], "X")[0].cta).toBe("PLAY NOW");
  });
});
