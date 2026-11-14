// Plan 05: the pure parts of the reel modules (voice presets, the script gate, approve, motion's brief reading,
// publish's table) and publish's dry run against the real studio schedulers: it must report the dry-run marker
// and leave the studio's catalog and post lists untouched (its sockets are blocked inside plan.py, so a planner
// that tried the network would fail the run instead of posting).

import type { HarnessEvent, ModuleContext } from "@harness/protocol";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { config } from "../src/config.ts";
import { approve, gate, hashOf, waiting, type Wait } from "../../../modules/_shared/gate.ts";
import { inSubtree, pick } from "../../../modules/approve/run.ts";
import { resolutionOf, secondsOf } from "../../../modules/motion/run.ts";
import { MARKER, tableLines, type Entry } from "../../../modules/publish/run.ts";
import { accountOf, cacheKey, presetOf } from "../../../modules/voice/run.ts";
import { briefsOf } from "../../../modules/campaign/run.ts";
import { lightingOf, opensRight, takeKey } from "../../../modules/reel.premise/run.ts";
import { gameFacts, gameLook } from "../../../modules/reel.explainer/run.ts";
import { gameLook as adLook, headlineOf } from "../../../modules/ad.image/run.ts";
import { DEFAULT } from "../../../modules/game/lib/design.ts";
import { VERTICAL, WIDE, dropOf, headPy, parseBeats, pickWindow, planEdit, segmentsOf } from "../../../modules/reel.trailer/edit.ts";
import { CAPTURE, fightsOf, footageKey, logOf } from "../../../modules/reel.trailer/run.ts";

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
  it("hands the chosen account's key to the tool under the name it reads", () => {
    const env = "# keys\nTOOL_KEY=second\nTOOL_KEY_FIRST=first\n";
    expect(accountOf({ voice: { account: { use: "TOOL_KEY_FIRST", as: "TOOL_KEY" } } }, env)).toEqual({ as: "TOOL_KEY", key: "first" });
    expect(accountOf({ voice: {} }, env)).toBeNull();
    expect(() => accountOf({ voice: { account: { use: "NOPE", as: "TOOL_KEY" } } }, env)).toThrow(/not in voice.envFile/);
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
  it("lets a go given to a stopped cell count for the next cell on the same script", async () => {
    const run = join(tmp, "run2");
    const script = join(tmp, "script2.txt");
    writeFileSync(script, "In this world, karts race.");
    mkdirSync(join(run, "approvals"), { recursive: true });
    const old: Wait = { node: "premise", label: "Premise", script, hash: hashOf("In this world, karts race."), at: "" };
    writeFileSync(join(run, "approvals", "premise.wait"), JSON.stringify(old));
    approve(run, old); // the author said go, but the cell that waited is gone
    const dir = join(run, "artifacts", "premise-2");
    mkdirSync(dir, { recursive: true });
    const steps: string[] = [];
    const ctx = {
      dir,
      node: "premise-2",
      config: {},
      signal: new AbortController().signal,
      step: (t: string) => steps.push(t),
      state: () => {},
      evidence: async () => "",
      sh: async (_c: string, a: string[]) => (writeFileSync(a[2], "png"), { code: 0, stdout: "", stderr: "" }),
    } as unknown as ModuleContext;
    await expect(gate(ctx, "Premise", script)).resolves.toBe("In this world, karts race.");
    expect(steps).toContain("Script approved earlier");
    expect(waiting(run)).toEqual([]);
    // the go is used up, but the approval stays for this exact text: a third ask (the voice failed) needs no new go
    expect(readdirSync(join(run, "approvals")).filter((f) => f.endsWith(".go"))).toEqual([]);
    steps.length = 0;
    await expect(gate({ ...ctx, node: "premise-3" } as ModuleContext, "Premise", script)).resolves.toBe("In this world, karts race.");
    expect(steps).toContain("Script approved earlier");
    // an edit needs a new go: the cell waits (stopped here by its signal)
    writeFileSync(script, "In this world, karts fly.");
    const stop = new AbortController();
    const waited = gate({ ...ctx, node: "premise-4", signal: stop.signal } as ModuleContext, "Premise", script);
    await new Promise((r) => setTimeout(r, 50));
    expect(waiting(run).map((w) => w.node)).toEqual(["premise-4"]);
    stop.abort();
    await expect(waited).rejects.toThrow("stopped");
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
    // the captions are about the game, never how it was made
    expect(lines[0]).toMatch(/^\d+ RIDERS$/);
    expect(lines.join(" ")).not.toMatch(/PROMPT|BUILT|GENERAT/);
    for (const t of e.texts) expect(t.t0 >= 0 && t.t1 <= 30 && t.t1 > t.t0).toBe(true);
  });

  it("keeps each shot of a director clip inside one camera angle, on a hit", () => {
    const cuts = [3, 6.2, 9.5, 12.8, 16, 19.1, 21.4];
    const dirClips = clips.map((c, i) => ({ ...c, seconds: 24, cuts, hits: [{ t: 1.5 + i, x: 0.8 }, { t: 7.4 + i, x: 0.3 }, { t: 14 + i, x: 0.5 }, { t: 20, x: 0.62 }] }));
    const e = planEdit(parseBeats(out), 75, 30, dirClips, words);
    const segs = segmentsOf(dirClips[0]);
    expect(segs[0]).toEqual([0, 2.96]);
    expect(segs.at(-1)).toEqual([21.44, 23.96]);
    let onHit = 0;
    for (const s of e.shots) {
      const clip = dirClips.find((c) => c.key === s.src)!;
      const a = s.ss, z = s.ss + (s.t1 - s.t0) * (s.sp ?? 1);
      expect(segmentsOf(clip).some(([x, y]) => a >= x - 1e-6 && z <= y + 1e-6)).toBe(true);
      if (clip.hits.some((h) => h.t > a && h.t < z)) onHit++;
      if (s.cx !== undefined) expect(s.cx >= 0.32 && s.cx <= 0.68).toBe(true);
    }
    expect(onHit).toBeGreaterThan(e.shots.length / 3);
  });

  it("prefers a landed hit to an attack that may miss", () => {
    const clip = { key: "A", role: "start" as const, seconds: 12, cuts: [4, 8], hits: [{ t: 2, x: 0.5, w: 0.4 }, { t: 6, x: 0.5, w: 1 }] };
    const w = pickWindow(clip, 1.5, 1, []);
    expect(w.ss).toBeGreaterThan(4);
    expect(w.ss + 1.5).toBeLessThan(8);
  });

  it("picks windows round hits, avoids reuse, slows a shot too long for any angle", () => {
    const clip = { key: "A", role: "start" as const, seconds: 12, cuts: [4, 8], hits: [{ t: 5, x: 0.9 }] };
    const w = pickWindow(clip, 1, 1, []);
    expect(w.ss).toBeLessThan(5);
    expect(w.ss + 1).toBeGreaterThan(5);
    expect(w.cx).toBeCloseTo(0.68);
    const again = pickWindow(clip, 1, 1, [[w.ss, w.ss + 1]]);
    expect(again.ss + 1 <= w.ss || again.ss >= w.ss + 1).toBe(true);
    const long = pickWindow(clip, 5, 1, []);
    expect(long.sp).toBeCloseTo(3.96 / 5, 3);   // the longest angle, 0-3.96 s
    expect(long.ss + 5 * long.sp).toBeLessThanOrEqual(12);
  });

  it("logs a capture in seconds and keys footage on the spec and the game's scripts", () => {
    const log = logOf({ fps: 30, cuts: [{ f: 0 }, { f: 90 }], hits: [{ f: 45, kind: "volt", seen: true, x: 0.4 }, { f: 60, kind: "sniper", seen: false, x: 0 }] }, "k");
    expect(log).toEqual({ key: "k", cuts: [3], hits: [{ t: 1.5, x: 0.4, kind: "volt", seen: true }, { t: 2, x: 0, kind: "sniper", seen: false }], attacks: [] });
    // attacks on screen count for less than hits; off-screen ones not at all
    const both = logOf({ fps: 30, cuts: [], hits: [{ f: 45, kind: "volt", seen: true, x: 0.4 }], attacks: [{ f: 30, kind: "thrower", seen: true, x: 0.6 }, { f: 33, kind: "sniper", seen: false, x: 1 }] }, "k");
    expect(fightsOf(both)).toEqual([{ t: 1, x: 0.6, w: 0.4 }, { t: 1.5, x: 0.4, w: 1 }]);
    expect(footageKey()).toMatch(/^[0-9a-f]{40}$/);
    expect(footageKey({ ...CAPTURE, seconds: 12 })).not.toBe(footageKey());
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

  it("picks the premise lighting: param, then the prompt, then day", () => {
    expect(lightingOf("night", "make it day")).toBe("night");
    expect(lightingOf(undefined, "Make it night")).toBe("night");
    expect(lightingOf(undefined, "re-render the premise reel at nighttime")).toBe("night");
    expect(lightingOf(undefined, "nightly build of the premise reel")).toBe("day");
    expect(lightingOf("dusk", undefined)).toBe("day");
  });

  it("fills briefs the worker missed and keeps the ones it wrote", () => {
    const b = briefsOf([{ audience: "Roblox players", angle: "Race your friends.", headline: "RACE. FIGHT.", cta: "Play free" }], ["unity", "roblox"], "Zapwick Rush");
    expect(b.map((x) => x.audience)).toEqual(["unity", "roblox"]);
    expect(b[1]).toMatchObject({ who: "Roblox players", headline: "RACE. FIGHT.", cta: "Play free" });
    expect(b[0].headline.length).toBeGreaterThan(0);
    expect(briefsOf("nonsense", ["roblox"], "X")[0].cta).toBe("PLAY NOW");
  });

  it("explains the Unity game from its design, never the harness", () => {
    const facts = gameFacts(DEFAULT, { project: "p", node: "game.unity", metres: 1199, build: { target: "windows", dir: "d", seconds: 1, flags: "f" } });
    const all = facts.join(" | ");
    expect(facts[0]).toBe('"Brawl Karts" is a kart racing game made in Unity that you play on PC.');
    expect(all).toContain("about 1200 metres a lap with one loop, one twist, glowing hover sections, a 14 metre drop");
    expect(all).toContain("A race is two laps.");
    expect(all).toContain("the other five are computer riders");
    for (const c of ["Volt", "Sniper", "Shrink", "Thrower"]) expect(all).toContain(c);
    expect(all).toContain(DEFAULT.win);
    expect(all.toLowerCase()).not.toMatch(/harness|sentence|generat/);
    expect(gameFacts(DEFAULT, { project: "p", node: "n", build: { target: "webgl", dir: "d", seconds: 1, flags: "f" } })[0]).toContain("in the browser");
    expect(gameLook(DEFAULT)).toContain("Blaze");
  });

  it("draws the ad picture as the game, with game-only defaults", () => {
    const look = adLook(DEFAULT);
    expect(look).toContain("show karts racing");
    expect(look).toContain(DEFAULT.models.kart);
    expect(look).not.toMatch(/sitting with both arms/);
    expect(adLook(undefined)).toBe("");
    expect(headlineOf("make an ad")).toBe("Race. Fight. Win.");
  });
});

describe("fixture recording", () => {
  it("gives run files that share a base name their own fixture files", async () => {
    const { extractFixture } = await import("../src/fixture.ts");
    const ev = (seq: number, x: Record<string, unknown>) => ({ seq, run: "r", t: seq, ...x }) as unknown as HarnessEvent;
    const events = [
      ev(1, { type: "node.spawn", node: "p", parent: "root", title: "P" }),
      ev(2, { type: "node.evidence", node: "p", kind: "video", uri: "artifacts/p/a.mp4", caption: "", meta: { frames: ["artifacts/p/stills/still-01.jpg"] } }),
      ev(3, { type: "node.evidence", node: "p", kind: "image", uri: "artifacts/p/night/still-01.jpg", caption: "", meta: { before: "artifacts/p/day/still-01.jpg" } }),
      ev(4, { type: "node.done", node: "p", summary: "ok" }),
    ];
    const { lines, files } = extractFixture(events, "p", "default");
    expect(new Set(files.values()).size).toBe(files.size);
    const img = lines.find((l) => l.kind === "image") as { uri: string; meta: { before: string } };
    expect(img.uri).toBe("./default/still-01-2.jpg");
    expect(img.meta.before).toBe("./default/still-01-3.jpg");
  });
});

describe("premise take key", () => {
  it("changes with the shots and with the cast, so a recast never reuses an old take", () => {
    const d = join(tmp, "premise-key");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "Shots.lua"), "return {}");
    const bare = takeKey(d);
    writeFileSync(join(d, "build_cast.lua"), "-- Thrower = Zoe");
    const zoe = takeKey(d);
    expect(zoe).not.toBe(bare);
    expect(takeKey(d)).toBe(zoe);
    writeFileSync(join(d, "build_cast.lua"), "-- Thrower = Jade");
    expect(takeKey(d)).not.toBe(zoe);
  });
});
