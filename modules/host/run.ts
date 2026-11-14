// "Put it online": the run's browser build at a public address. The bridge already serves the build
// (runs/<id>/artifacts/webgl/, no token, Unity's compressed files with the right headers); this cell opens a
// quick tunnel in front of the bridge, waits until the new address answers from outside, screenshots the game
// through it, and publishes the link. The same tunnel carries the crossplay relay (/relay/<room>), so the Roblox
// place gets that public address in its Flags module (and in the open Studio place, through Studio's MCP).
//
// The tunnel belongs to the run: it closes when the run is cancelled, when the bridge stops, or on `pnpm stop`.
// For Roblox, a public link means publishing the place, which always waits for the author's approval: without
// it the cell shows a "ready to publish" tile and a short play test recorded in Studio.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { repoRoot } from "../../apps/bridge/src/config.ts";
import { answered, resolveDoh, tunnels } from "../../apps/bridge/src/tunnels.ts";
import { blank, measure, openPage } from "../_shared/browser.ts";
import { harnessStudio, playTest, writeSharedModule } from "../_shared/robloxStudio.ts";
import { Place } from "../game.roblox/lib/roblox.ts";
import { patchState, readState, runDirOf } from "../game/lib/state.ts";

const MB = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx.dir);
  const state = readState(runDir);
  const bridge = String(ctx.config.bridge.url).replace(/\/$/, "");
  const room = ctx.run.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
  const uri = (f: string) => relative(runDir, f).split(sep).join("/");

  // 1. the build
  const build = findBuild(runDir, state, input);
  if (build) {
    const files = walk(build);
    const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
    const packed = files.filter((f) => /\.(gz|br)$/.test(f)).length;
    ctx.step("Build found", `${uri(build)}: ${files.length} files, ${MB(bytes)}${packed ? `, ${packed} compressed` : ""}`, "box");
  } else {
    const why = state.unity?.build?.target === "windows" ? "this run's game was built for Windows (the editor has no WebGL module yet)" : "this run has no browser build";
    ctx.step("No browser build", `${why}; the address still carries the crossplay relay`, "alert");
  }

  // 2. the local server
  // the bridge serves a run's build at /runs/<id>/<path in the run>/, without the token
  const path = build ? `/runs/${ctx.run}/${uri(build)}/` : `/relay/${room}?since=-1`;
  const local = await fetch(bridge + path);
  if (local.status !== 200) throw new Error(`the bridge answered ${local.status} for ${path}`);
  const enc = build ? await compressedHeader(`${bridge}/runs/${ctx.run}`, runDir, build) : "";
  ctx.step("Server up", `${bridge}${path} answers 200${enc ? `; ${enc}` : ""}`, "check");

  // 3. the tunnel
  const t = await tunnels.ensure(bridge, ctx.run, { signal: ctx.signal, timeoutMs: 90_000 });
  ctx.step("Tunnel up", `${t.url} -> ${t.target} (quick tunnel, closed with the run)`, "link");

  // 4. the address answers from outside (resolved over DNS-over-HTTPS: a lookup made too early can be cached as missing)
  const pub = t.url + path;
  const probe = await answered(pub, { timeoutMs: 180_000, signal: ctx.signal, onTry: (n, why) => n % 5 === 0 && ctx.step("Waiting for the address", `try ${n}: ${why}`, "clock") });
  if (!probe) throw new Error(`${pub} did not answer within 3 minutes`);
  ctx.step("URL answered", `200 from ${new URL(pub).host} in ${probe.ms} ms`, "check");

  const relayHttp = `${t.url}/relay/${room}`;
  patchState(runDir, { host: { node: ctx.node, tunnel: t.url, ...(build ? { play: pub } : {}), relay: relayHttp, at: Date.now() } });

  // 5. what the page looks like through the public address
  let summary = "";
  if (build) {
    const shotFile = join(ctx.dir, "public-shot.png");
    const r = await screenshot(pub, probe.ip, shotFile, ctx);
    const shotUri = uri(shotFile);
    await ctx.evidence("link", shotFile, "Through the public address", { url: pub, shot: shotUri, errors: r.errors.length, blank: r.blank });
    await ctx.output("Play in browser", join(build, "index.html"), "link", pub);
    summary = `Online at ${pub}${r.blank ? " (the first frames were still blank)" : ""}`;
  } else {
    summary = `Relay online at ${relayHttp}; no browser build to host`;
  }

  // 6. the relay through the same address: the Roblox place posts there
  if (state.roblox?.place && existsSync(state.roblox.project)) {
    const place = new Place(state.roblox.project, ctx.config);
    const flags = place.patchFlags({ relayUrl: relayHttp });
    const b = place.build();
    ctx.step("Roblox relay address", `Flags.luau relayUrl = ${relayHttp}; place rebuilt in ${b.seconds.toFixed(1)} s`, "link");
    await roblox(ctx, state.roblox.project, flags, runDir);
  }

  writeFileSync(
    join(ctx.dir, "host.md"),
    [
      "# Hosted",
      "",
      build ? `- Play: ${pub}` : "- No browser build in this run.",
      `- Crossplay relay: ${relayHttp} (POST a state, get the others back; WebSocket on the same path)`,
      `- Tunnel: quick tunnel ${t.url} to ${t.target}. It closes when the run is cancelled, when the bridge stops, or on \`pnpm stop\`.`,
      "",
    ].join("\n"),
  );
  await ctx.evidence("doc", join(ctx.dir, "host.md"), "Addresses");
  return { summary };
}

/** the run's browser build: game-state.json, params.dir, or artifacts/webgl */
function findBuild(runDir: string, state: ReturnType<typeof readState>, input: ModuleInput): string | null {
  const cands = [
    typeof input.params?.dir === "string" ? join(runDir, input.params.dir) : "",
    state.unity?.build?.target === "webgl" ? state.unity.build.dir : "",
    join(runDir, "artifacts", "webgl"),
  ];
  for (const c of cands) if (c && existsSync(join(c, "index.html"))) return c;
  return null;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else out.push(f);
  }
  return out;
}

/** checks that one compressed Unity file goes out with Content-Encoding and its inner type (`base` is the run's address) */
async function compressedHeader(base: string, runDir: string, build: string): Promise<string> {
  const f = walk(build).find((x) => /\.(wasm|data|js)\.(gz|br)$/.test(x));
  if (!f) return "build not compressed";
  const r = await fetch(base + "/" + relative(runDir, f).split(sep).join("/"), { headers: { "accept-encoding": "gzip, br" } });
  await r.arrayBuffer();
  const enc = r.headers.get("content-encoding");
  if (r.status !== 200 || !enc) throw new Error(`${f.split(sep).pop()} went out without Content-Encoding`);
  return `${f.split(sep).pop()} as ${r.headers.get("content-type")}, ${enc}`;
}

/** opens the public page in a headless browser (pinned to the address that answered) and waits for a picture */
async function screenshot(url: string, ip: string, file: string, ctx: ModuleContext): Promise<{ errors: string[]; blank: boolean }> {
  const host = new URL(url).hostname;
  const ips = ip ? [ip] : await resolveDoh(host);
  const o = await openPage(url, { width: 1280, height: 720, pin: ips[0] ? { host, ip: ips[0] } : undefined, timeoutMs: 90_000 });
  try {
    let shot: Buffer = Buffer.alloc(0);
    let isBlank = true;
    // software WebGL in a headless browser takes a while to load and draw the first frames
    for (let k = 0; k < 20 && isBlank && !ctx.signal.aborted; k++) {
      await new Promise((r) => setTimeout(r, 3000));
      shot = await o.page.screenshot({ type: "png" });
      isBlank = blank(await measure(o.page, shot));
    }
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, shot);
    ctx.step(isBlank ? "Page loaded, picture still blank" : "Game draws through the public address", o.errors.length ? `${o.errors.length} console errors: ${o.errors[0]}` : "no console errors", isBlank ? "alert" : "eye");
    return { errors: o.errors, blank: isBlank };
  } finally {
    await o.close();
  }
}

/**
 * Roblox: the open Studio place gets the new Flags (relay address); publishing waits for the author, so the cell
 * shows a "ready to publish" tile and a short play test recorded in Studio.
 */
async function roblox(ctx: ModuleContext, project: string, flags: Record<string, unknown>, runDir: string): Promise<void> {
  const placeFile = join(project, "place.rbxlx");
  const doc = join(ctx.dir, "roblox-publish.md");
  writeFileSync(
    doc,
    [
      "# Roblox: ready to publish",
      "",
      "A public Roblox link means publishing the place to the game's account. That always waits for your approval.",
      "",
      `- The built place: \`${relative(repoRoot, placeFile).split(sep).join("/")}\` (in this repository)`,
      `- Its relay address (Flags.luau): \`${String(flags.relayUrl)}\``,
      "- To publish: open the place in Studio, File > Publish to Roblox, and allow HTTP requests in Game Settings > Security.",
      "",
    ].join("\n"),
  );
  await ctx.output("Roblox: ready to publish", doc, "doc");

  const name = String(ctx.config.roblox?.studioPlace ?? "");
  const s = name && !/^<.*>$/.test(name) ? await harnessStudio(name) : null;
  if (!s) {
    ctx.step("Studio not open", `the place "${name || "(roblox.studioPlace not set)"}" is not open in Roblox Studio, so no play test`, "alert");
    return;
  }
  try {
    const src = readFileSync(join(project, "src", "shared", "Flags.luau"), "utf8");
    ctx.step("Studio place updated", `${await writeSharedModule(s, "Flags", src)} (${s.name}; not saved or published)`, "box");
    ctx.step("Play test in Studio", "5 s", "play");
    const p = await playTest(s, 5, 4);
    const dir = join(ctx.dir, "studio-play");
    mkdirSync(dir, { recursive: true });
    const frames = p.frames.map((b, i) => {
      const f = join(dir, `frame_${String(i + 1).padStart(2, "0")}.png`);
      writeFileSync(f, b);
      return f;
    });
    if (frames.length) {
      await ctx.evidence("frames", frames[0], "Play test in Studio", { frames: frames.map((f) => relative(runDir, f).split(sep).join("/")), fps: 1, loop: true, fit: "cover" });
    }
    ctx.step(p.errors.length ? "Play test: script errors" : "Play test: no script errors", p.errors.length ? p.errors.slice(0, 3).join(" | ") : `${p.seconds.toFixed(1)} s, ${frames.length} frames`, p.errors.length ? "alert" : "check");
  } catch (e) {
    ctx.step("Studio play test failed", (e as Error).message, "alert");
  } finally {
    s.mcp.close();
  }
}
