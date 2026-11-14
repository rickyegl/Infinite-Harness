// The six Roblox part cells (Track, Karts, Humanoids, Combat, UI, Build) share this runner. Each part writes its
// section of Config.luau from the design (and switches its piece on in `built`); Track also writes TrackData.luau
// from the Unity editor's track_export so both games race on the same centre line. Build lints with selene and
// builds place.rbxlx with rojo.
//
// The place is not opened in Studio, so the evidence is drawn from the data the place is built from, plus the
// Luau that runs it.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type Design, unitySections } from "../../game/lib/design.ts";
import { patchState, readState, runDirOf } from "../../game/lib/state.ts";
import { designOf, unityFor } from "../../game.unity/lib/parts.ts";
import { codeLines, excerpt, gridSvg, attacksSvg, classesSvg, hudSvg, luau, placeFor, type TrackData, trackProfileSvg, trackTopSvg, writeSvg } from "./roblox.ts";

export type PartId = "track" | "karts" | "humanoids" | "combat" | "ui" | "build";

export const PARTS: { id: PartId; label: string; brief: (d: Design) => string }[] = [
  { id: "track", label: "Track", brief: (d) => `Road parts along the same ${d.track.shape} centre line as the Unity game: loops, twists, banks${d.track.hover ? ", hover sections" : ""}.` },
  { id: "karts", label: "Karts", brief: (d) => `${d.karts.count} part-built karts that drive in track space, players plus AI.` },
  { id: "humanoids", label: "Humanoids", brief: () => "Four rider classes (volt, sniper, shrink, thrower), each in its own gear, with the generated rider model when it is uploaded." },
  { id: "combat", label: "Combat", brief: () => "Server-side class attacks: electric dash, crosshair shot every 10 s, shrink and speed boost, thrown item every 3 s; hit feed." },
  { id: "ui", label: "UI", brief: (d) => `ScreenGui HUD for "${d.hud.title}": lap, place, speed, countdown, feed, minimap.` },
  { id: "build", label: "Build", brief: () => "Lint the Luau with selene and build the place file with rojo." },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const count = (feats: { kind: string }[], k: string) => feats.filter((f) => f.kind === k).length;

/** the Unity orchestrator records its project once the editor is set up; the track export needs that editor */
async function waitForUnity(ctx: ModuleContext): Promise<void> {
  const runDir = runDirOf(ctx.dir);
  const t0 = Date.now();
  while (!readState(runDir).unity?.project) {
    if (ctx.signal.aborted) throw new Error("stopped");
    if (Date.now() - t0 > 15 * 60_000) throw new Error("the Unity editor was not ready after 15 minutes; the track comes from its generator");
    await sleep(1000);
  }
}

export async function runPart(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const part = ctx.manifest.id.split(".").pop() as PartId;
  const d = designOf(ctx, input);
  const s = unitySections(d);
  const place = placeFor(ctx);
  const firstColor = d.karts.colors[0] ?? "#e8463c";
  switch (part) {
    case "track": {
      ctx.step("Asking the Unity editor for the centre line", "the same generator, so both games race on one track", "cube");
      await waitForUnity(ctx);
      const u = unityFor(ctx);
      const file = join(ctx.dir, "track.json");
      const r = u.json<{ samples: number; metres: number; features: string[] }>(await u.op("track_export", { spec: JSON.stringify(s.track), file }, 10 * 60_000));
      const data = JSON.parse(readFileSync(file, "utf8")) as TrackData;
      place.writeTrack(data);
      place.patchConfig({ built: { track: true } });
      const f = data.features;
      const hover = data.hover.filter((h) => h > 0.5).length / Math.max(1, data.hover.length);
      ctx.step(
        `${r.samples} samples, ${r.metres} m lap`,
        [count(f, "loop") && `${count(f, "loop")} loop`, count(f, "twist") && `${count(f, "twist")} twist`, count(f, "drop") && "a drop", hover && `${Math.round(hover * 100)}% hover`, "3 studs per metre"].filter(Boolean).join(", "),
        "road",
      );
      await ctx.evidence("image", writeSvg(ctx, "track-top.svg", trackTopSvg(data, d.title)), "Track from above", { fit: "contain" });
      await ctx.evidence("image", writeSvg(ctx, "track-profile.svg", trackProfileSvg(data)), "Height along the lap", { fit: "contain" });
      return { summary: `${r.metres} m lap (${Math.round(r.metres * 3)} studs)${r.features.length ? ` with ${r.features.join(", ")}` : ""}, written to TrackData.luau` };
    }
    case "karts": {
      ctx.step("Placing the grid", d.karts.names.slice(0, d.karts.count).join(", "), "game");
      place.patchConfig({ karts: s.karts, built: { karts: true } });
      await ctx.evidence("image", writeSvg(ctx, "grid.svg", gridSvg(d.karts, d.track.width)), "Starting grid", { fit: "contain" });
      await ctx.evidence("code", writeLuau(ctx, "karts.luau", `karts = ${luau(s.karts)}`), "Config.luau: karts", { lines: codeLines(`karts = ${luau(s.karts)}`) });
      return { summary: `${d.karts.count} karts, top speed ${(d.karts.topSpeed * 3.6).toFixed(0)} km/h, players take a kart when they join` };
    }
    case "humanoids": {
      ctx.step("Building the four rider classes", "volt coil, sniper rifle and scope, shrink potion and propeller, thrower satchel", "person");
      place.patchConfig({ riders: s.riders, built: { riders: true } });
      const src = excerpt(place.source("src/server/Race.server.luau"), "if built.riders then", "classGear(model, cls.kind");
      await ctx.evidence("image", writeSvg(ctx, "classes.svg", classesSvg(d.riders, d.karts.colors.length ? d.karts.colors : [firstColor])), "Rider classes", { fit: "contain" });
      await ctx.evidence("code", writeLuau(ctx, "riders.luau", src), "Race.server.luau: riders", { lines: codeLines(src, 30, " ") });
      return { summary: "a rider on every kart in one of four classes: volt, sniper, shrink, thrower; each player picks one on joining" };
    }
    case "combat": {
      ctx.step("Switching on the class attacks", "dash every 4 s, shot every 10 s, shrink every 9 s, throw every 3 s", "sword");
      place.patchConfig({ combat: s.combat, built: { combat: true } });
      const src = excerpt(place.source("src/server/Race.server.luau"), "local function land(", "-- players");
      await ctx.evidence("image", writeSvg(ctx, "attacks.svg", attacksSvg({ slow: d.combat.slow, knock: d.combat.knock, aiAggression: d.combat.aiAggression })), "Class attacks", { fit: "contain" });
      await ctx.evidence("code", writeLuau(ctx, "combat.luau", src), "Race.server.luau: attacks", { lines: codeLines(src, 30, " ") });
      return { summary: `four class attacks checked on the server; a hit keeps ${Math.round(d.combat.slow * 100)}% of speed and shoves` };
    }
    case "ui": {
      ctx.step("Laying out the HUD", "lap, place, speed, countdown, hit feed, results, minimap", "layout");
      place.patchConfig({ hud: s.hud, built: { hud: true } });
      const src = excerpt(place.source("src/client/Client.client.luau"), "local title = label", "local feedN");
      await ctx.evidence("image", writeSvg(ctx, "hud.svg", hudSvg(d.hud, place.readTrack(), d.laps, d.karts.names)), "HUD layout", { fit: "contain" });
      await ctx.evidence("code", writeLuau(ctx, "hud.luau", src), "Client.client.luau: HUD", { lines: codeLines(src, 30, " ") });
      return { summary: `HUD for "${d.hud.title}" with ${d.hud.minimap ? "a minimap" : "no minimap"}` };
    }
    case "build":
      return buildPart(ctx, d);
  }
}

/** which generated 3D models the place loads by asset id, and which are still part-built until their upload */
function modelLines(m?: { loaded: string[]; waiting: string[] }): string[] {
  if (!m || (!m.loaded.length && !m.waiting.length)) return [];
  return [
    `- 3D models loaded as Roblox assets: ${m.loaded.length ? m.loaded.join(", ") : "none"}`,
    ...(m.waiting.length ? [`- Part-built until uploaded (needs the author's go-ahead): ${m.waiting.join(", ")}; the files are listed in uploads.json of the Roblox cell`] : []),
    "",
  ];
}

function writeLuau(ctx: ModuleContext, name: string, text: string): string {
  const f = join(ctx.dir, name);
  writeFileSync(f, text.endsWith("\n") ? text : text + "\n");
  return f;
}

async function buildPart(ctx: ModuleContext, d: Design): Promise<ModuleOutput> {
  const place = placeFor(ctx);
  const runDir = runDirOf(ctx.dir);
  ctx.step("Linting the Luau", "selene, Roblox standard library", "check");
  const lint = place.lint();
  if (lint.errors) throw new Error(`selene found ${lint.errors} error${lint.errors > 1 ? "s" : ""}: ${lint.report.split("\n").slice(0, 2).join(" ")}`);
  ctx.step(`${lint.errors} errors, ${lint.warnings} warnings`, "selene src", "check");
  ctx.step("Building the place", "rojo build -o place.rbxlx", "hammer");
  const b = place.build();
  const kb = Math.round(b.bytes / 1024);
  ctx.step(`place.rbxlx, ${kb} KB in ${b.seconds.toFixed(1)} s`, "not opened in Studio", "box");
  const copy = join(ctx.dir, "place.rbxlx");
  copyFileSync(b.file, copy);
  const report = [
    `# ${d.title}: Roblox place`,
    "",
    "Built from the Rojo project with `rojo build`; not opened in Studio and not play-tested in Studio yet.",
    "",
    ...modelLines(readState(runDir).roblox?.models),
    `- Lint: selene, ${lint.errors} errors, ${lint.warnings} warnings`,
    `- Place file: place.rbxlx, ${kb} KB, built in ${b.seconds.toFixed(1)} s`,
    `- Project: ${relative(fileURLToPath(new URL("../../..", import.meta.url)), place.project).split(sep).join("/") || place.project}`,
    "- Scripts: ServerScriptService.Server.Race (track, karts, AI, combat, relay), StarterPlayerScripts.Client.Client (input, camera, HUD)",
    "- Shared: Config (design), TrackData (centre line from the Unity editor), Flags (live follow-ups), Track, Look",
    "",
    "To open it: double-click place.rbxlx, or run `rojo serve` in the project and connect from the Rojo plugin.",
    "Publishing needs the author's go-ahead.",
  ].join("\n");
  writeFileSync(join(ctx.dir, "build.md"), report + "\n");
  await ctx.evidence("code", writeLuau(ctx, "build.log", `$ selene src\n${lint.errors} errors, ${lint.warnings} warnings\n$ rojo build -o place.rbxlx\nBuilt project to place.rbxlx (${kb} KB)`), "Lint and build", {
    lines: [
      [" ", "$ selene src"],
      ["+", `${lint.errors} errors, ${lint.warnings} warnings`],
      [" ", "$ rojo build -o place.rbxlx"],
      ["+", `Built project to place.rbxlx (${kb} KB, ${b.seconds.toFixed(1)} s)`],
    ],
  });
  await ctx.evidence("doc", join(ctx.dir, "build.md"), "Roblox place");
  await ctx.output("Roblox place", copy, "file");
  patchState(runDir, { roblox: { ...(readState(runDir).roblox ?? { project: place.project, node: "" }), project: place.project, place: b.file } });
  return { summary: `place.rbxlx built (${kb} KB, lint clean); not opened in Studio` };
}
