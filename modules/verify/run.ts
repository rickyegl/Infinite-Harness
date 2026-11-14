// "Make no mistakes": checks what every other cell of the run made, puts a check mark (or an alert) on that
// cell, and sends one fix back to the cell that made a broken thing, then checks it again. One retry, then an
// honest report: the Verifier fails when something is still broken.
//
// It waits until the cells it checks have finished (it reads the run's own events.jsonl, which the bridge writes
// event by event), so it can be planned beside them. What it checks, per file a cell attached or published:
//   every file    exists and is not empty
//   images        not one flat colour, and the size the cell said (meta.width/height) or at least 64 px
//   frames        every frame exists; the first is not blank
//   video/audio   ffprobe: a duration, a picture of the stated size, an audio stream (published videos)
//   links         the address answers 200; the page loads headless with no console errors and draws a picture
//   browser build the run's WebGL build loads from this bridge with no console errors and draws a picture
//   Roblox place  the open harness place in Studio plays 5 s with no script errors (skipped when Studio is closed)

import type { GraphState, ModuleContext, ModuleInput, ModuleOutput, NodeView } from "@harness/protocol";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { answered, resolveDoh } from "../../apps/bridge/src/tunnels.ts";
import { blank, CHROMIUM_ARGS, measure, openPage, type Pixels } from "../_shared/browser.ts";
import { harnessStudio, playTest } from "../_shared/robloxStudio.ts";
import { others, runState, waitForOthers } from "../_shared/runEvents.ts";
import { ffprobe } from "../_shared/studio.ts";
import { readState, runDirOf, type GameState } from "../game/lib/state.ts";

/** cells it never checks: itself, the run's root, the asset hub, other verifiers and the recorder (it runs after) */
const SKIP_MODULES = new Set(["verify", "recorder"]);
const IMAGE = /\.(png|jpe?g|webp|svg)$/i;

type Item = { owner: string; kind: string; uri: string; href?: string; meta?: Record<string, unknown>; output: boolean };
type Result = { ok: string[]; bad: string[]; shallow: string[] };

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx.dir);
  const waitMs = Number(input.params?.waitMs ?? 4 * 3600_000);

  // 1. wait for the cells it checks
  let g = await waitForOthers(ctx, runDir, SKIP_MODULES, waitMs);
  const owners = others(g, ctx.node, SKIP_MODULES);
  if (!owners.length) {
    ctx.step("Nothing to check", "no other cell in this run made anything", "check");
    return { summary: "Nothing to check" };
  }
  ctx.step("Checking", `${owners.length} ${owners.length === 1 ? "cell" : "cells"}: ${owners.map((n) => g.nodes[n].label).join(", ")}`, "verifier");

  const checker = new Checker(ctx, runDir);
  try {
    const failed: string[] = [];
    const shallow = new Set<string>();
    let fixed = 0;
    for (const owner of owners) {
      const node = g.nodes[owner];
      if (node.state === "failed") {
        ctx.mark(owner, "Not checked", "this cell failed on its own", "alert");
        failed.push(`${node.label}: failed before the check`);
        continue;
      }
      let r = await checker.cell(g, owner);
      r.shallow.forEach((s) => shallow.add(s));
      if (!r.bad.length) {
        pass(ctx, node, r);
        continue;
      }
      ctx.mark(owner, "Check failed", r.bad.join("; "), "alert");
      ctx.step(`${node.label}: check failed`, r.bad.join("; "), "alert");

      // 2. one fix, then the same checks again
      try {
        await ctx.ask(owner, { prompt: `The Verifier found: ${r.bad.join("; ")}. Make it again so these are right.` });
      } catch (e) {
        ctx.step(`${node.label}: the fix failed`, (e as Error).message, "alert");
      }
      g = runState(runDir);
      r = await checker.cell(g, owner);
      if (!r.bad.length) {
        fixed++;
        pass(ctx, g.nodes[owner], r, true);
      } else {
        ctx.mark(owner, "Still failing after one fix", r.bad.join("; "), "alert");
        failed.push(`${node.label}: ${r.bad.join("; ")}`);
      }
    }
    if (shallow.size) ctx.step("Not checked in depth", [...shallow].join("; "), "eye");
    const n = owners.length;
    if (failed.length) throw new Error(`${failed.length} of ${n} cells still fail: ${failed.join(" | ")}`);
    return { summary: `${n} ${n === 1 ? "cell" : "cells"} checked, all pass${fixed ? ` (${fixed} after one fix)` : ""}` };
  } finally {
    await checker.close();
  }
}

function pass(ctx: ModuleContext, node: NodeView, r: Result, afterFix = false): void {
  const what = r.ok.length ? r.ok.join("; ") : "nothing to check";
  ctx.mark(node.id, afterFix ? "Checked after the fix" : "Checked", what, "check");
  ctx.step(`${node.label}: ${afterFix ? "passes after the fix" : "passes"}`, what, "check");
}

// ------------------------------------------------------------------ the checks

class Checker {
  private browser: any = null;
  private page: any = null;
  private state: GameState;
  private bridge: string;

  constructor(private ctx: ModuleContext, private runDir: string) {
    this.state = readState(runDir);
    this.bridge = String(ctx.config.bridge.url).replace(/\/$/, "");
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => {});
  }

  private async pixels(file: string): Promise<Pixels> {
    if (!this.page) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ args: CHROMIUM_ARGS });
      this.page = await this.browser.newPage();
    }
    const ext = extname(file).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : ext === ".svg" ? "image/svg+xml" : "image/png";
    return measure(this.page, readFileSync(file), mime);
  }

  /** what a cell attached (evidence) and published (outputs), each uri once */
  private items(n: NodeView): Item[] {
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const o of n.outputs) {
      const key = `${o.uri} ${o.href ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ owner: n.id, kind: o.kind, uri: o.uri, href: o.href, output: true });
    }
    for (const e of n.evidence) {
      if (seen.has(e.uri)) continue;
      seen.add(e.uri);
      out.push({ owner: n.id, kind: e.kind, uri: e.uri, meta: e.meta, output: false });
    }
    return out;
  }

  async cell(g: GraphState, owner: string): Promise<Result> {
    const n = g.nodes[owner];
    const r: Result = { ok: [], bad: [], shallow: [] };
    const items = this.items(n);
    let files = 0;
    for (const it of items) {
      const f = join(this.runDir, it.uri);
      const name = it.uri.split("/").pop()!;
      if (/^https?:/.test(it.uri)) continue;
      if (!existsSync(f) || !statSync(f).isFile()) {
        r.bad.push(`${name} is missing`);
        continue;
      }
      if (statSync(f).size === 0) {
        r.bad.push(`${name} is empty`);
        continue;
      }
      files++;
      try {
        await this.file(it, f, name, r);
      } catch (e) {
        r.bad.push(`${name}: ${(e as Error).message}`);
      }
    }
    if (files) r.ok.unshift(`${files} ${files === 1 ? "file" : "files"} present`);
    for (const it of items) if (it.href && /^https?:/.test(it.href)) await this.link(it.href, r);

    // the run's browser build and its Roblox place belong to the cell that made them
    const build = this.state.unity?.build;
    if (build?.target === "webgl" && this.state.unity?.node === owner && existsSync(join(build.dir, "index.html"))) {
      const rel = build.dir.slice(this.runDir.length + 1).split(/[\\/]/).join("/");
      // served by the bridge at /runs/<id>/<path in the run>/, without the token
      await this.page_(`${this.bridge}/runs/${basename(this.runDir)}/${rel}/`, "the browser build", r);
    }
    if (this.state.roblox?.place && this.state.roblox.node === owner) await this.roblox(r);
    return r;
  }

  private async file(it: Item, f: string, name: string, r: Result): Promise<void> {
    const kind = it.kind;
    if (kind === "image" || (IMAGE.test(name) && kind !== "frames" && kind !== "link")) {
      const p = await this.pixels(f);
      const w = Number(it.meta?.width), h = Number(it.meta?.height);
      if (w && h && (p.width !== w || p.height !== h)) r.bad.push(`${name} is ${p.width}x${p.height}, not ${w}x${h}`);
      else if (!w && (p.width < 64 || p.height < 64)) r.bad.push(`${name} is only ${p.width}x${p.height}`);
      else if (blank(p)) r.bad.push(`${name} is blank (one flat colour)`);
      else r.ok.push(`${name} ${p.width}x${p.height}, not blank`);
      return;
    }
    if (kind === "frames") {
      const list = Array.isArray(it.meta?.frames) ? (it.meta!.frames as string[]) : [it.uri];
      const missing = list.filter((u) => !existsSync(join(this.runDir, u)));
      if (missing.length) {
        r.bad.push(`${missing.length} of ${list.length} frames missing`);
        return;
      }
      const p = await this.pixels(join(this.runDir, list[0]));
      if (blank(p)) r.bad.push(`the first frame of ${name} is blank`);
      else r.ok.push(`${list.length} frames, ${p.width}x${p.height}`);
      return;
    }
    if (kind === "video" || kind === "audio" || /\.(mp4|webm|mov|wav|mp3|ogg|m4a)$/i.test(name)) {
      await this.media(it, f, name, r);
      return;
    }
    if (kind === "model3d" && /\.gltf$/i.test(name)) {
      const j = JSON.parse(readFileSync(f, "utf8"));
      if (!Array.isArray(j.meshes) || !j.meshes.length) r.bad.push(`${name} has no meshes`);
      else r.ok.push(`${name}: ${j.meshes.length} meshes`);
      return;
    }
    if (kind === "link") {
      if (typeof it.meta?.shot === "string") {
        const shot = join(this.runDir, it.meta.shot);
        if (!existsSync(shot)) r.bad.push(`the screenshot of ${name} is missing`);
        else if (blank(await this.pixels(shot))) r.bad.push(`the screenshot through ${String(it.meta.url ?? "the link")} is blank`);
      }
      return;
    }
    // docs, code, data: present and not empty is all
  }

  private async media(it: Item, f: string, name: string, r: Result): Promise<void> {
    const p = await this.ctx.sh(ffprobe(this.ctx), ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", f], { timeoutMs: 60_000 });
    if (p.code !== 0) throw new Error("ffprobe cannot read it");
    const j = JSON.parse(p.stdout) as { format?: { duration?: string }; streams?: { codec_type: string; width?: number; height?: number }[] };
    const dur = Number(j.format?.duration ?? 0);
    const v = j.streams?.find((s) => s.codec_type === "video");
    const a = j.streams?.find((s) => s.codec_type === "audio");
    const video = it.kind === "video" || /\.(mp4|webm|mov)$/i.test(name);
    const before = r.bad.length;
    if (!(dur > 0.2)) r.bad.push(`${name} has no length`);
    const want = Number(it.meta?.duration ?? it.meta?.seconds);
    if (want && dur && Math.abs(dur - want) > Math.max(0.5, want * 0.1)) r.bad.push(`${name} is ${dur.toFixed(1)} s, not ${want} s`);
    if (video) {
      if (!v?.width || !v?.height) r.bad.push(`${name} has no picture`);
      const w = Number(it.meta?.width), h = Number(it.meta?.height);
      if (v?.width && w && h && (v.width !== w || v.height !== h)) r.bad.push(`${name} is ${v.width}x${v.height}, not ${w}x${h}`);
      // a published video has sound; evidence clips (a capture, a play test) may be silent
      if (it.output && !a && it.meta?.silent !== true) r.bad.push(`${name} has no audio stream`);
    } else if (!a) r.bad.push(`${name} has no audio stream`);
    if (r.bad.length === before) r.ok.push(`${name} ${dur.toFixed(1)} s${v?.width ? ` ${v.width}x${v.height}` : ""}${a ? " with audio" : ""}`);
  }

  private async link(href: string, r: Result): Promise<void> {
    const host = new URL(href).hostname;
    const local = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host);
    const probe = local ? null : await answered(href, { timeoutMs: 60_000, signal: this.ctx.signal });
    if (!local && !probe) {
      r.bad.push(`${href} does not answer`);
      return;
    }
    if (probe) r.ok.push(`${host} answers ${probe.status}`);
    await this.page_(href, host, r, probe?.ip);
  }

  /** loads a page headless: no console errors, and a picture that is not blank within a minute */
  private async page_(url: string, what: string, r: Result, ip?: string): Promise<void> {
    const host = new URL(url).hostname;
    const pinIp = ip ?? (/\.trycloudflare\.com$/.test(host) ? (await resolveDoh(host))[0] : undefined);
    let o;
    try {
      o = await openPage(url, { width: 1280, height: 720, pin: pinIp ? { host, ip: pinIp } : undefined, timeoutMs: 90_000 });
    } catch (e) {
      r.bad.push(`${what} does not load: ${(e as Error).message.split("\n")[0]}`);
      return;
    }
    try {
      let isBlank = true;
      for (let k = 0; k < 20 && isBlank && !this.ctx.signal.aborted; k++) {
        await new Promise((res) => setTimeout(res, 3000));
        isBlank = blank(await measure(o.page, await o.page.screenshot({ type: "png" })));
      }
      const errs = o.errors.filter((e) => !/favicon/i.test(e));
      if (errs.length) r.bad.push(`${what}: ${errs.length} console errors (${errs[0]})`);
      if (isBlank) r.bad.push(`${what} still shows a blank picture after a minute`);
      if (!errs.length && !isBlank) r.ok.push(`${what} loads headless, no console errors, draws a picture`);
    } finally {
      await o.close();
    }
  }

  private async roblox(r: Result): Promise<void> {
    const name = String(this.ctx.config.roblox?.studioPlace ?? "");
    const s = name && !/^<.*>$/.test(name) ? await harnessStudio(name) : null;
    if (!s) {
      r.shallow.push("Roblox play test (the harness place is not open in Studio)");
      return;
    }
    try {
      const p = await playTest(s, 5, 0);
      if (p.errors.length) r.bad.push(`the Roblox play test printed script errors: ${p.errors.slice(0, 2).join(" | ")}`);
      else r.ok.push(`Roblox play test ${p.seconds.toFixed(1)} s, no script errors`);
    } finally {
      s.mcp.close();
    }
  }
}
