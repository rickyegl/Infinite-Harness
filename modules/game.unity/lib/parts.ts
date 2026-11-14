// The six Unity part cells (Track, Karts, Humanoids, Combat, UI, Build) share this runner. Each part writes its
// section of game.json from the design, lets the editor rebuild the scene, and attaches editor shots as
// `frames` evidence plus that game.json section as `code` evidence. Build also race-tests on autopilot, records 10 s of play to mp4 and builds the
// player (WebGL when the editor has the module, otherwise Windows).
//
// The design is improvised by a worker (game.design); everything here is scripted editor operations, so the
// parts take seconds on a warm editor.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { type Design, DEFAULT, tidyDesign, unitySections } from "../../game/lib/design.ts";
import { patchState, readState, runDirOf } from "../../game/lib/state.ts";
import { codeLines } from "../../game.roblox/lib/roblox.ts";
import { Unity, unityPaths } from "./unity.ts";

export type PartId = "track" | "karts" | "humanoids" | "combat" | "ui" | "build";

export const PARTS: { id: PartId; label: string; brief: (d: Design) => string }[] = [
  { id: "track", label: "Track", brief: (d) => `Lay the ${d.track.shape} circuit: ${d.track.loops} loops, ${d.track.twists} twists, bank ${d.track.bank.toFixed(1)}, ${d.track.drop.toFixed(0)} m drop${d.track.hover ? ", hover sections" : ""}.` },
  { id: "karts", label: "Karts", brief: (d) => `${d.karts.count} arcade karts, top speed ${(d.karts.topSpeed * 3.6).toFixed(0)} km/h.` },
  { id: "humanoids", label: "Humanoids", brief: () => "A rider on every kart in one of four classes (volt, sniper, shrink, thrower), each in its own gear." },
  { id: "combat", label: "Combat", brief: () => "Class attacks: electric dash, crosshair shot every 10 s, shrink and speed boost, thrown item every 3 s." },
  { id: "ui", label: "UI", brief: (d) => `HUD for "${d.hud.title}": lap, place, speed, minimap, hit feed.` },
  { id: "build", label: "Build", brief: () => "Race-test on autopilot, record 10 s of play, build the player." },
];

export const unityFor = (ctx: ModuleContext) => new Unity(unityPaths(ctx.config), (t, d) => ctx.step(t, d, "cube"));

export const designOf = (ctx: ModuleContext, input: ModuleInput): Design =>
  tidyDesign((input.params?.design as Design | undefined) ?? readState(runDirOf(ctx.dir)).design ?? DEFAULT);

/** run-relative uri of a file that already lives inside the run */
export const uriOf = (ctx: ModuleContext, file: string) => relative(runDirOf(ctx.dir), file).split(sep).join("/");

/** editor shots of named views into ctx.dir/<sub>; returns the files */
export async function shotFiles(ctx: ModuleContext, u: Unity, views: string[], sub = "shots"): Promise<string[]> {
  const dir = join(ctx.dir, sub);
  mkdirSync(dir, { recursive: true });
  const r = await u.op("shots", { dir, views: views.join(","), width: 1280, height: 720 }, 5 * 60_000);
  const files = (u.json<string[]>(r) ?? []).map((f) => f.replace(/\//g, sep)).filter((f) => existsSync(f));
  if (!files.length) throw new Error("the editor returned no shots");
  return files;
}

/** editor shots of named views, attached as one `frames` evidence */
export async function shots(ctx: ModuleContext, u: Unity, views: string[], caption: string, sub = "shots"): Promise<string[]> {
  const files = await shotFiles(ctx, u, views, sub);
  await ctx.evidence("frames", files[0], caption, { frames: files.map((f) => uriOf(ctx, f)), fps: 1, loop: true, fit: "cover" });
  return files;
}

/** the game.json section a part wrote, attached as `code` evidence */
export async function section(ctx: ModuleContext, name: string, value: unknown): Promise<void> {
  const text = `"${name}": ${JSON.stringify(value, null, 2)}`;
  const file = join(ctx.dir, `${name}.json`);
  writeFileSync(file, `{
${text}
}
`);
  await ctx.evidence("code", file, `game.json: ${name}`, { lines: codeLines(text) });
}

type Info = { track: boolean; metres?: number; features?: string[]; hoverShare?: number; climb?: number; karts?: number };

export async function runPart(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const part = ctx.manifest.id.split(".").pop() as PartId;
  const d = designOf(ctx, input);
  const s = unitySections(d);
  const u = unityFor(ctx);
  switch (part) {
    case "track": {
      ctx.step("Generating the centre line", `${d.track.shape}, ${d.track.length.toFixed(0)} m, seed ${d.track.seed}`, "road");
      u.patchConfig({ track: s.track, built_track: true });
      const info = u.json<Info>(await u.op("info"));
      const feats = info.features ?? [];
      const count = (k: string) => feats.filter((f) => f === k).length;
      ctx.step(
        `Lap of ${info.metres} m`,
        [count("loop") && `${count("loop")} loop`, count("twist") && `${count("twist")} twist`, count("drop") && `drop of ${info.climb} m`, info.hoverShare && `${Math.round(info.hoverShare * 100)}% hover`].filter(Boolean).join(", ") || "flat",
        "road",
      );
      const views = ["overview", ...(count("loop") ? ["loop"] : []), ...(count("twist") ? ["twist"] : []), ...(count("drop") ? ["drop"] : []), "corner"].slice(0, 4);
      if (info.metres) patchState(runDirOf(ctx.dir), { unity: { ...readState(runDirOf(ctx.dir)).unity!, metres: info.metres } });
      await shots(ctx, u, views, "Track");
      await section(ctx, "track", s.track);
      return { summary: `${info.metres} m lap${feats.length ? ` with ${feats.join(", ")}` : ""}` };
    }
    case "karts": {
      ctx.step("Placing the grid", d.karts.names.slice(0, d.karts.count).join(", "), "game");
      u.patchConfig({ karts: s.karts, built_karts: true });
      const hasLoop = d.track.loops > 0, hasTwist = d.track.twists > 0;
      await shots(ctx, u, ["grid", "kart", ...(hasLoop ? ["loopride"] : hasTwist ? ["twistride"] : [])], "Karts");
      await section(ctx, "karts", s.karts);
      return { summary: `${d.karts.count} karts on the grid` };
    }
    case "humanoids": {
      ctx.step("Seating the riders", `volt, sniper, shrink and thrower classes, height ${d.riders.height.toFixed(2)}`, "person");
      u.patchConfig({ riders: s.riders, built_riders: true });
      await shots(ctx, u, ["rider", "pack"], "Riders");
      await section(ctx, "riders", s.riders);
      return { summary: `${d.karts.count} riders in four classes; you ride the sniper` };
    }
    case "combat": {
      ctx.step("Wiring the class attacks", `dash every 4 s, shot every 10 s, shrink every 9 s, throw every 3 s; a hit keeps ${Math.round(d.combat.slow * 100)}% speed`, "sword");
      u.patchConfig({ combat: s.combat, built_combat: true });
      await shots(ctx, u, ["combat", "chase"], "Combat");
      await section(ctx, "combat", s.combat);
      return { summary: "Four class attacks; a hit shoves, slows, spins and flashes" };
    }
    case "ui": {
      ctx.step("Drawing the HUD", `${d.hud.title}: lap, place, speed${d.hud.minimap ? ", minimap" : ""}, hit feed`, "layout");
      u.patchConfig({ hud: s.hud, built_hud: true });
      await shots(ctx, u, ["hud", "start"], "HUD");
      await section(ctx, "hud", s.hud);
      return { summary: "HUD with lap, place, speed and minimap" };
    }
    case "build":
      return build(ctx, u, d);
  }
  throw new Error(`unknown part ${part}`);
}

/** per class: riders, attacks used and hits landed in the race test */
const attackLines = (t: Test) =>
  t.attacks ? ["| Class | Riders | Attacks used | Hits |", "| --- | --- | --- | --- |", ...Object.entries(t.attacks).map(([k, a]) => `| ${k}${k === t.playerClass ? " (player)" : ""} | ${a.riders} | ${a.uses} | ${a.hits} |`)] : [];

type Test = { finished: boolean; raceSeconds: number; hits: number; attacks?: Record<string, { riders: number; uses: number; hits: number }>; playerClass?: string; trackMetres: number; karts: { name: string; place: number; laps: number; time: number | null; player: boolean }[] };

async function build(ctx: ModuleContext, u: Unity, d: Design): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx.dir);
  // 1. race test on autopilot
  ctx.step("Race test on autopilot", `${d.laps} laps, every kart driven by the AI`, "play");
  const finish = join(ctx.dir, "finish.jpg");
  const t = u.json<Test>(await u.op("play_test", { timeout: 300, file: finish }, 8 * 60_000));
  const order = [...t.karts].sort((a, b) => a.place - b.place).map((k) => `${k.place}. ${k.name}${k.time != null ? ` ${k.time.toFixed(1)} s` : ""}`);
  ctx.step(t.finished ? `Race finished in ${t.raceSeconds.toFixed(0)} s` : "Race did not finish", `${t.hits} hits; ${order.join(", ")}`, t.finished ? "check" : "alert");
  writeFileSync(join(ctx.dir, "race-test.md"), [`# Race test`, "", `Finished: ${t.finished ? "yes" : "no"} in ${t.raceSeconds.toFixed(1)} s on a ${t.trackMetres} m lap, ${t.hits} hits.`, "", ...order.map((l) => `- ${l}`), "", ...attackLines(t), ""].join("\n"));
  if (!t.finished) throw new Error("the race test did not finish");

  // 2. ten seconds of play from just before the first loop (or twist), to mp4
  const from = d.track.loops ? "loop" : d.track.twists ? "twist" : "";
  ctx.step("Recording 10 s of play", from ? `starting just before the ${from}` : "from the start", "record");
  const cap = join(ctx.dir, "capture");
  await u.op("play_capture", { outDir: cap, seconds: 10, fps: 30, width: 1280, height: 720, warmup: 3, from }, 8 * 60_000);
  const mp4 = join(ctx.dir, "gameplay.mp4");
  const ff = ctx.config.paths?.ffmpeg || "ffmpeg";
  const enc = await ctx.sh(ff, ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(cap, "frame_%05d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-movflags", "+faststart", mp4], { timeoutMs: 3 * 60_000 });
  if (enc.code !== 0 || !existsSync(mp4)) throw new Error(`ffmpeg: ${enc.stderr.split("\n")[0]}`);
  // keep three stills from the clip as the frames evidence, drop the rest
  const frames = readdirSync(cap).filter((f) => /^frame_\d+\.jpg$/.test(f)).sort();
  const keep = [0.15, 0.5, 0.85].map((p) => frames[Math.min(frames.length - 1, Math.floor(p * frames.length))]);
  for (const f of frames) if (!keep.includes(f)) rmSync(join(cap, f), { force: true });
  const stills = [...new Set(keep)].map((f) => join(cap, f));
  await ctx.evidence("frames", stills[0], "In play", { frames: stills.map((f) => uriOf(ctx, f)), fps: 1, loop: true, fit: "cover" });
  await ctx.evidence("video", mp4, "10 s of play", { frames: stills.map((f) => uriOf(ctx, f)) });
  if (existsSync(finish)) await ctx.evidence("image", finish, "Finish");
  await ctx.evidence("doc", join(ctx.dir, "race-test.md"), "Race test");

  // 3. the player build: WebGL when the editor has the module, otherwise Windows
  const ping = u.json<{ webgl: boolean }>(await u.op("ping"));
  const target = ping.webgl ? "webgl" : "windows";
  const outDir = join(runDir, "artifacts", target);
  ctx.step(`Building for ${target === "webgl" ? "the browser" : "Windows"}`, ping.webgl ? "WebGL player, served by the bridge" : "the WebGL module is not installed in this editor, so this is the Windows fallback", "hammer");
  const b = u.json<{ target: string; seconds: number; bytes: number }>(await u.op("build", { target, outDir }, 30 * 60_000));
  ctx.step(`Built in ${b.seconds.toFixed(0)} s`, `${(b.bytes / 1e6).toFixed(0)} MB`, "check");
  const port = ctx.config.bridge?.port ?? 7411;
  const host = ctx.config.bridge?.host ?? "127.0.0.1";
  let href: string | undefined;
  if (target === "webgl") {
    href = `http://${host}:${port}/runs/${ctx.run}/artifacts/webgl/index.html`;
    await ctx.output("Play in browser", join(outDir, "index.html"), "link", href);
  } else {
    await ctx.output("Windows build", join(outDir, "BrawlKarts.exe"), "file");
  }
  await ctx.output("Gameplay", mp4, "video");
  const flags = target === "webgl" ? join(outDir, "StreamingAssets", "harness.json") : join(outDir, "BrawlKarts_Data", "StreamingAssets", "harness.json");
  patchState(runDir, { unity: { project: u.project, node: ctx.node.split(".").slice(0, -1).join("."), build: { target, dir: outDir, seconds: b.seconds, href, flags } } });
  return { summary: `${target === "webgl" ? "WebGL" : "Windows"} build in ${b.seconds.toFixed(0)} s; race test ${t.raceSeconds.toFixed(0)} s, ${t.hits} hits` };
}
