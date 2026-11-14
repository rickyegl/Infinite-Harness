// Runner: one Run per active run. Plans the prompt, runs each planned cell when its `after` cells are
// done, gives every cell a ModuleContext, and turns harness MCP tool calls into events.
//
// Event conventions (same as the fixtures):
//   root cell "root" (kind root); planned cells hang under root, or under `under` for follow-ups
//   asset handoff: the requester sends node.request to the "assets" hub, the hub spawns the provider
//   cell under itself, and the hub sends node.deliver back to the requester
//   spawn_task: a child cell `<node>.<slug>` running a named module, or a sub-worker with the parent's allow block

import type { EvidenceKind, ModuleContext, ModuleInput, ModuleManifest, ModuleOutput, NodeKind } from "@harness/protocol";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlaceholder, repoRoot, type HarnessConfig } from "./config.ts";
import { loadRun, summaries, type LoadedModule } from "./modules.ts";
import { route, type Existing, type PlanNode } from "./router.ts";
import type { NewEvent, RunLog, RunStore } from "./store.ts";
import { harnessToolList } from "./workers/allow.ts";
import { resolveGrants, runWorker, type Grants } from "./workers/index.ts";
import { runText } from "./workers/proc.ts";

const HARNESS_MCP = join(dirname(fileURLToPath(import.meta.url)), "mcp", "harness-mcp.mjs");

export type RunnerDeps = {
  store: RunStore;
  cfg: HarnessConfig;
  mods: Map<string, LoadedModule>;
  /** base URL workers use to reach the bridge */
  bridgeUrl: string;
  tokenFile: string;
};

type Cell = {
  id: string;
  parent: string | null;
  module: string;
  manifest: ModuleManifest;
  dir: string;
  open: boolean;
  failed: boolean;
  children: number;
  /** set while a worker runs for this cell: what the harness MCP may do */
  worker?: { grants: Grants; cwd: string };
  ctx?: ModuleContext;
  evidence: string[];
  /** source files already shown as evidence (absolute) */
  attached?: Set<string>;
};

/** The pseudo-module behind spawn_task: a sub-worker with its parent's limits. A sub-worker's own
 *  sub-workers may not spawn again, so a run cannot fan out without bound (two levels below a module). */
const subAgent = (parent: ModuleManifest): ModuleManifest => {
  const tools = parent.allow.tools ?? [];
  const nested = parent.id === "agent";
  const allow = nested
    ? { ...parent.allow, tools: tools.flatMap((t) => (t === "harness.*" ? ["harness.report_step", "harness.attach_evidence", "harness.request_asset", "harness.publish_output"] : t === "harness.spawn_task" ? [] : [t])) }
    : parent.allow;
  return {
    id: "agent", label: "Agent", icon: "agent", kind: "agent", summary: "a sub-task handed off by a worker",
    accepts: ["text"], produces: [], runtime: "cli-agent", mock: false, allow,
  };
};

const ROOT: ModuleManifest = { id: "root", label: "Infinite Harness", icon: "spark", kind: "orchestrator", summary: "", accepts: [], produces: [], runtime: "script", mock: false, allow: {} };
const HUB: ModuleManifest = { ...ROOT, id: "assets", label: "Assets", icon: "box" };

const KIND_BY_EXT: [RegExp, EvidenceKind][] = [
  [/\.(png|jpe?g|webp|svg|gif)$/i, "image"],
  [/\.(mp4|webm|mov|mkv)$/i, "video"],
  [/\.(glb|gltf|fbx|obj|blend|usdz?)$/i, "model3d"],
  [/\.(wav|mp3|ogg|m4a|flac)$/i, "audio"],
  [/\.(md|txt|pdf|docx?|rtf|csv)$/i, "doc"],
];
export const kindOf = (file: string): EvidenceKind => KIND_BY_EXT.find(([re]) => re.test(file))?.[1] ?? "code";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "task";
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res) => {
    if (ms <= 0 || signal.aborted) return res();
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      res();
    };
    const t = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
const inside = (file: string, dir: string) => {
  const r = relative(dir, file);
  return !!r && !r.startsWith("..") && !isAbsolute(r);
};

export class Runner {
  readonly runs = new Map<string, Run>();
  constructor(readonly d: RunnerDeps) {}

  start(prompt: string): Run {
    const r = new Run(this, this.d.store.create(prompt), false);
    this.runs.set(r.id, r);
    r.begin(prompt);
    return r;
  }

  say(id: string, text: string): Run {
    let r = this.runs.get(id);
    if (!r) {
      if (!this.d.store.meta(id)) throw new Error(`no run ${id}`);
      r = new Run(this, this.d.store.reopen(id), true);
      this.runs.set(id, r);
    }
    r.followUp(text);
    return r;
  }

  cancel(id: string): boolean {
    const r = this.runs.get(id);
    if (!r) return false;
    r.cancel();
    return true;
  }

  /** A harness MCP call from a worker. */
  tool(run: string, node: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
    const r = this.runs.get(run);
    if (!r) throw new Error(`run ${run} is not active`);
    return r.tool(node, tool, args);
  }
}

export class Run {
  readonly abort = new AbortController();
  readonly cells = new Map<string, Cell>();
  private inflight = 0;
  private ended = false;
  private requests = 0;
  private agentCalls = 0;

  constructor(readonly runner: Runner, readonly log: RunLog, resumed: boolean) {
    if (resumed) this.rebuild();
  }

  get id() {
    return this.log.id;
  }
  private get cfg(): HarnessConfig {
    return this.runner.d.cfg;
  }

  emit(p: NewEvent): void {
    if (this.ended) return;
    this.log.append(p);
  }

  // ------------------------------------------------------------ planning

  begin(prompt: string): void {
    this.emit({ type: "run.start", node: "root", prompt });
    this.addCell("root", null, ROOT, "Infinite Harness", prompt, "root");
    this.emit({ type: "node.state", node: "root", state: "running" });
    void this.plan(prompt);
  }

  followUp(text: string): void {
    if (this.ended) throw new Error("run is closed");
    this.emit({ type: "node.state", node: "root", state: "running" });
    this.emit({ type: "node.step", node: "root", title: "Follow-up", detail: text, icon: "spark" });
    void this.plan(text);
  }

  /** a reopened run: the cells it already has, so follow-ups can hang under them */
  private rebuild(): void {
    for (const e of this.log.events) {
      if (e.type !== "node.spawn") continue;
      const m = e.node === "root" ? ROOT : e.node === "assets" ? HUB : this.runner.d.mods.get(e.module)?.manifest ?? { ...ROOT, id: e.module, label: e.label, kind: e.kind === "root" ? "orchestrator" : e.kind };
      this.cells.set(e.node, { id: e.node, parent: e.parent, module: e.module, manifest: m, dir: join(this.log.dir, "artifacts", e.node), open: false, failed: false, children: 0, evidence: [] });
      if (e.parent && this.cells.has(e.parent)) this.cells.get(e.parent)!.children++;
    }
  }

  private async plan(prompt: string): Promise<void> {
    this.inflight++;
    try {
      const existing: Existing[] = [...this.cells.values()].filter((c) => c.id !== "root" && c.id !== "assets").map((c) => ({ id: c.id, module: c.module, label: this.labelOf(c.id) }));
      this.emit({ type: "node.step", node: "root", title: "Planning", detail: prompt, icon: "spark" });
      const mods = [...this.runner.d.mods.values()].filter((m) => !m.manifest.id.startsWith("_") && !m.manifest.hidden);
      const r = await route(this.cfg, prompt, summaries(mods), {
        existing,
        workDir: join(this.log.dir, "work", `router-${this.agentCalls++}`),
        signal: this.abort.signal,
        useRecorded: this.cfg.mock.enabled,
      });
      this.emit({ type: "node.step", node: "root", title: `Planned ${r.plan.nodes.length} ${r.plan.nodes.length === 1 ? "task" : "tasks"}`, detail: r.plan.nodes.map((n) => n.label).join(", "), icon: "layers" });
      writeJson(join(this.log.dir, `plan-${this.log.events.length}.json`), { prompt, backend: r.backend, ms: r.ms, plan: r.plan });
      await this.schedule(r.plan.nodes);
    } catch (e) {
      if (!this.abort.signal.aborted) this.emit({ type: "node.step", node: "root", title: "Planning failed", detail: (e as Error).message, icon: "alert" });
      this.planFailed = true;
    } finally {
      this.inflight--;
      this.maybeFinish();
    }
  }
  private planFailed = false;

  private labelOf(id: string): string {
    for (const e of this.log.events) if (e.type === "node.spawn" && e.node === id) return e.label;
    return id;
  }

  private schedule(nodes: PlanNode[]): Promise<unknown> {
    const done = new Map<string, Promise<ModuleOutput | null>>();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const start = (n: PlanNode): Promise<ModuleOutput | null> => {
      if (done.has(n.id)) return done.get(n.id)!;
      const p = (async () => {
        const deps = await Promise.all(n.after.map((a) => start(byId.get(a)!)));
        const parent = n.under && this.cells.has(n.under) ? n.under : "root";
        const id = this.freeId(n.id);
        const mod = this.runner.d.mods.get(n.module)!;
        if (deps.some((x) => x === null)) {
          this.addCell(id, parent, mod.manifest, n.label, n.prompt);
          this.closeCell(id, new Error(`not started: ${n.after.filter((_, i) => deps[i] === null).join(", ")} failed`));
          return null;
        }
        const refs = deps.flatMap((x) => (x?.files ?? []).map((f) => f.uri));
        try {
          return await this.runCell(id, parent, mod, n.label, { prompt: n.prompt, refs });
        } catch {
          return null;
        }
      })();
      done.set(n.id, p);
      return p;
    };
    return Promise.all(nodes.map(start));
  }

  private freeId(want: string): string {
    let id = want;
    for (let k = 2; this.cells.has(id); k++) id = `${want}-${k}`;
    return id;
  }

  private childId(parent: string, name: string): string {
    const base = parent === "root" ? slug(name) : `${parent}.${slug(name)}`;
    return this.freeId(base);
  }

  private maybeFinish(): void {
    if (this.inflight > 0 || this.ended) return;
    const cells = [...this.cells.values()].filter((c) => c.id !== "root");
    // the hub's own requests: a failed one is counted apart from the tasks (the task that asked can still finish)
    const lost = cells.filter((c) => c.parent === "assets" && c.failed).length;
    const hub = this.cells.get("assets");
    if (hub?.open) {
      const got = hub.children - lost;
      this.closeCell("assets", null, `${got} ${got === 1 ? "asset" : "assets"} delivered${lost ? `, ${lost} failed` : ""}`);
    }
    const tasks = cells.filter((c) => c.parent === "root" && c.id !== "assets");
    const n = tasks.length;
    const failed = tasks.filter((c) => c.failed).length;
    const also = lost ? ` (${lost} ${lost === 1 ? "asset" : "assets"} failed)` : "";
    if (this.planFailed && n === 0) this.emit({ type: "node.error", node: "root", message: "nothing was planned" });
    else this.emit({ type: "node.done", node: "root", summary: (failed ? `${n - failed} of ${n} tasks finished` : `${n} ${n === 1 ? "task" : "tasks"} finished`) + also });
    this.emit({ type: "run.done", node: "root" });
    this.log.close(failed || this.planFailed ? "failed" : "done");
    this.ended = true;
    this.runner.runs.delete(this.id);
  }

  cancel(): void {
    if (this.ended) return;
    this.abort.abort();
    for (const c of [...this.cells.values()].reverse()) if (c.open && c.id !== "root") this.closeCell(c.id, new Error("cancelled"));
    this.emit({ type: "node.error", node: "root", message: "cancelled" });
    this.emit({ type: "run.done", node: "root" });
    this.log.close("failed", "cancelled");
    this.ended = true;
    this.runner.runs.delete(this.id);
  }

  // ------------------------------------------------------------ cells

  private addCell(id: string, parent: string | null, m: ModuleManifest, label: string, prompt: string, kind: NodeKind = m.kind): Cell {
    const cell: Cell = { id, parent, module: m.id, manifest: m, dir: join(this.log.dir, "artifacts", id), open: true, failed: false, children: 0, evidence: [] };
    this.cells.set(id, cell);
    if (parent) this.cells.get(parent)!.children++;
    this.emit({
      type: "node.spawn", node: id, parent, module: m.id, label, kind,
      ...(prompt ? { prompt } : {}),
      // the maker comes from the manifest only; a worker can never set it
      ...(m.maker && m.kind === "tool" ? { maker: m.maker } : {}),
    });
    return cell;
  }

  private closeCell(id: string, err: Error | null, summary?: string): void {
    const c = this.cells.get(id);
    if (!c || !c.open) return;
    c.open = false;
    if (err) {
      c.failed = true;
      this.emit({ type: "node.error", node: id, message: err.message });
    } else this.emit({ type: "node.done", node: id, summary: summary ?? "" });
  }

  /** Spawns a cell and runs its module to the end. Throws when it fails (after node.error). */
  async runCell(id: string, parent: string, mod: LoadedModule | { manifest: ModuleManifest; dir: string; hasRun: false; fixtures: [] }, label: string, input: ModuleInput): Promise<ModuleOutput> {
    this.inflight++;
    const cell = this.addCell(id, parent, mod.manifest, label, input.prompt);
    this.emit({ type: "node.state", node: id, state: "running" });
    mkdirSync(cell.dir, { recursive: true });
    const ctx = this.context(cell);
    cell.ctx = ctx;
    try {
      let out: ModuleOutput;
      if (this.cfg.mock.enabled && mod.manifest.mock && mod.fixtures.length) out = await this.replay(cell, mod as LoadedModule);
      else if (mod.hasRun) out = await (await loadRun(mod as LoadedModule))(ctx, input);
      else if (mod.manifest.runtime === "cli-agent") {
        // an agent module without run.ts: its prompt.md (if any) leads, the cell's task follows
        const md = mod.dir ? join(mod.dir, "prompt.md") : "";
        const lead = md && existsSync(md) ? readFileSync(md, "utf8").trim() + "\n\n## Task\n\n" : "";
        const r = await ctx.agent(lead + input.prompt);
        out = { summary: r.text };
      } else throw new Error(`${mod.manifest.id} has no run.ts`);
      if (this.abort.signal.aborted) throw new Error("cancelled");
      out = { ...out, files: out.files ?? this.filesOf(id) };
      this.closeCell(id, null, out.summary);
      return out;
    } catch (e) {
      this.closeCell(id, e as Error);
      throw e;
    } finally {
      this.inflight--;
      this.maybeFinish();
    }
  }

  private filesOf(id: string): { name: string; uri: string; kind: string }[] {
    const out: { name: string; uri: string; kind: string }[] = [];
    for (const e of this.log.events) {
      if (e.node !== id) continue;
      if (e.type === "node.output") out.push({ name: e.name, uri: e.uri, kind: e.kind });
      else if (e.type === "node.evidence") out.push({ name: basename(e.uri), uri: e.uri, kind: e.kind });
    }
    return out;
  }

  /** run-relative uri of a file, copying it into the cell's artifacts when it lives outside the run */
  private artifact(cell: Cell, file: string): string {
    const runDir = this.log.dir;
    let f = resolve(file);
    if (!existsSync(f) || !statSync(f).isFile()) throw new Error(`no file ${file}`);
    if (!inside(f, join(runDir, "artifacts"))) {
      mkdirSync(cell.dir, { recursive: true });
      let dest = join(cell.dir, basename(f));
      for (let k = 2; existsSync(dest) && resolve(dest) !== f; k++) dest = join(cell.dir, `${basename(f, extname(f))}-${k}${extname(f)}`);
      copyFileSync(f, dest);
      f = dest;
    }
    return relative(runDir, f).split(sep).join("/");
  }

  private context(cell: Cell): ModuleContext {
    const run = this;
    const id = cell.id;
    const abs = (f: string) => (isAbsolute(f) ? f : join(cell.worker?.cwd ?? cell.dir, f));
    const ctx: ModuleContext = {
      run: this.id,
      node: id,
      manifest: cell.manifest,
      dir: cell.dir,
      // bridge.url: where this bridge really listens (the configured port can be 0 in tests and smoke runs)
      config: { ...this.cfg, bridge: { ...this.cfg.bridge, url: this.runner.d.bridgeUrl } } as unknown as Record<string, any>,
      signal: this.abort.signal,
      mock: this.cfg.mock.enabled,
      step: (title, detail, icon) => run.emit({ type: "node.step", node: id, title, ...(detail ? { detail } : {}), ...(icon ? { icon } : {}) }),
      evidence: async (kind, file, caption, meta) => {
        (cell.attached ??= new Set()).add(resolve(abs(file)));
        const uri = run.artifact(cell, abs(file));
        cell.evidence.push(uri);
        run.emit({ type: "node.evidence", node: id, kind, uri, ...(caption ? { caption } : {}), ...(meta ? { meta } : {}) });
        return uri;
      },
      output: async (name, file, kind, href) => {
        const uri = run.artifact(cell, abs(file));
        run.emit({ type: "node.output", node: id, name, uri, kind, ...(href ? { href } : {}) });
        return uri;
      },
      request: (moduleId, input) => run.request(id, moduleId, input),
      spawn: (moduleId, input, opts) => {
        const mod = run.runner.d.mods.get(moduleId);
        if (!mod) return Promise.reject(new Error(`no module ${moduleId}`));
        return run.runCell(run.childId(id, opts?.label ?? moduleId.split(".").pop()!), id, mod, opts?.label ?? mod.manifest.label, input);
      },
      sh: (cmd, args, opts) => runText(cmd, args, { cwd: opts?.cwd ?? cell.dir, timeoutMs: opts?.timeoutMs ?? 10 * 60_000, env: opts?.env }),
      agent: async (prompt, opts = {}) => {
        const name = opts.worker ?? run.cfg.defaultWorker;
        const wcfg = run.cfg.workers[name];
        if (!wcfg || isPlaceholder(wcfg.cmd)) throw new Error(`workers.${name} is not configured`);
        const cwd = opts.cwd ?? join(run.log.dir, "work", `${id}${run.agentCalls++ ? `-${run.agentCalls}` : ""}`);
        mkdirSync(cwd, { recursive: true });
        const grants = resolveGrants(cell.manifest.allow, { runDir: run.log.dir, nodeDir: cell.dir }, run.cfg);
        cell.worker = { grants, cwd };
        mkdirSync(join(run.log.dir, "workers"), { recursive: true });
        const raw = createWriteStream(join(run.log.dir, "workers", `${id}.jsonl`), { flags: "a" });
        const written: string[] = [];
        try {
          const out = await runWorker({
            name, cfg: wcfg, prompt, cwd, grants, manifest: cell.manifest,
            harnessMcp: {
              command: process.execPath,
              args: [HARNESS_MCP],
              env: {
                HARNESS_BRIDGE: run.runner.d.bridgeUrl, HARNESS_TOKEN_FILE: run.runner.d.tokenFile,
                HARNESS_RUN: run.id, HARNESS_NODE: id, HARNESS_CWD: cwd, HARNESS_TOOLS: harnessToolList(grants).join(","),
              },
            },
            schema: opts.schema,
            timeoutMs: opts.timeoutMs ?? wcfg.timeoutMs,
            signal: run.abort.signal,
            onStep: (title, detail, icon) => ctx.step(title, detail, icon),
            onFile: (p) => written.push(resolve(cwd, p)),
            onRaw: (line) => raw.write(line + "\n"),
          });
          if (!out.ok) throw new Error(out.error ?? "worker failed");
          return { ok: true, text: out.text, json: out.json, files: out.files, cwd };
        } finally {
          raw.end();
          cell.worker = undefined;
          // files the worker wrote become evidence, unless it already attached them itself (with a caption)
          for (const f of written) {
            if (cell.attached?.has(f) || !existsSync(f)) continue;
            try {
              await ctx.evidence(kindOf(f), f, basename(f));
            } catch {
              /* written and removed again */
            }
          }
        }
      },
    };
    return ctx;
  }

  /** asset handoff through the "assets" hub */
  async request(from: string, moduleId: string, input: ModuleInput): Promise<ModuleOutput> {
    // until a kind's real generator is installed, the placeholder module answers (it makes a file of that kind)
    const mod = this.runner.d.mods.get(moduleId) ?? this.runner.d.mods.get("mock.asset");
    if (!mod) throw new Error(`no module ${moduleId} for this asset`);
    if (!this.cells.has("assets")) {
      this.addCell("assets", "root", HUB, "Assets", "");
      this.emit({ type: "node.state", node: "assets", state: "running" });
    } else if (!this.cells.get("assets")!.open) {
      this.cells.get("assets")!.open = true;
      this.emit({ type: "node.state", node: "assets", state: "running" });
    }
    const requestId = `q${++this.requests}`;
    this.emit({ type: "node.request", node: from, to: "assets", what: input.prompt, requestId });
    this.emit({ type: "node.state", node: from, state: "waiting" });
    try {
      const out = await this.runCell(this.childId("assets", moduleId.split(".").pop()!), "assets", mod, mod.manifest.label, input);
      const uri = out.files?.[0]?.uri;
      if (!uri) throw new Error(`${moduleId} delivered no file`);
      this.emit({ type: "node.deliver", node: "assets", to: from, requestId, uri });
      return out;
    } finally {
      if (this.cells.get(from)?.open) this.emit({ type: "node.state", node: from, state: "running" });
    }
  }

  // ------------------------------------------------------------ mock replay

  /**
   * Replays a module fixture (modules/<m>/fixtures/*.jsonl, recorded from a real run by `pnpm fixture`).
   * Lines are events without seq/run; `node` "." is this cell, other ids are relative to it; t is ms since
   * the cell started, scaled by mock.speed; uris starting "./" are files in the fixtures folder.
   */
  private async replay(cell: Cell, mod: LoadedModule): Promise<ModuleOutput> {
    const file = join(mod.dir, "fixtures", mod.fixtures[0]);
    const fxDir = dirname(file);
    const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
    const speed = this.cfg.mock.speed > 0 ? this.cfg.mock.speed : 1;
    const t0 = this.log.now();
    const map = (n: string | null | undefined) => (n === null || n === undefined ? n : n === "." ? cell.id : `${cell.id}.${n}`);
    let summary = "";
    for (const l of lines) {
      await sleep(t0 + l.t / speed - this.log.now(), this.abort.signal);
      if (this.abort.signal.aborted) throw new Error("cancelled");
      const node = map(l.node)!;
      if (node === cell.id && (l.type === "node.done" || l.type === "node.spawn")) {
        if (l.type === "node.done") summary = l.summary;
        continue;
      }
      if (node === cell.id && l.type === "node.error") throw new Error(l.message);
      const { t: _t, seq: _s, run: _r, ...rest } = l;
      const ev = { ...rest, node } as NewEvent & Record<string, unknown>;
      if ("parent" in ev) ev.parent = map(ev.parent as string);
      if (typeof ev.to === "string" && ev.to !== "assets") ev.to = map(ev.to);
      const target = this.cells.get(node) ?? cell;
      const own = (u: unknown) => (typeof u === "string" && u.startsWith("./") ? this.artifact({ ...target, dir: join(this.log.dir, "artifacts", node) }, join(fxDir, u)) : u);
      for (const k of ["uri", "thumb"]) ev[k] = own(ev[k]);
      // evidence meta can name more fixture files: a frame list, a before picture
      if (ev.meta && typeof ev.meta === "object") {
        const m = { ...(ev.meta as Record<string, unknown>) };
        if (Array.isArray(m.frames)) m.frames = m.frames.map(own);
        if (m.before !== undefined) m.before = own(m.before);
        ev.meta = m;
      }
      if (ev.type === "node.spawn") {
        const m = this.runner.d.mods.get(ev.module) ?? { manifest: { ...ROOT, id: ev.module, label: ev.label, kind: ev.kind === "root" ? "orchestrator" : ev.kind } };
        this.cells.set(node, { id: node, parent: ev.parent ?? cell.id, module: ev.module, manifest: m.manifest as ModuleManifest, dir: join(this.log.dir, "artifacts", node), open: true, failed: false, children: 0, evidence: [] });
        this.cells.get(ev.parent ?? cell.id)!.children++;
      }
      if ((ev.type === "node.done" || ev.type === "node.error") && this.cells.has(node)) {
        const c = this.cells.get(node)!;
        c.open = false;
        c.failed = ev.type === "node.error";
      }
      this.emit(ev);
    }
    return { summary };
  }

  // ------------------------------------------------------------ harness MCP

  async tool(node: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
    const cell = this.cells.get(node);
    if (!cell?.ctx || !cell.worker) throw new Error(`cell ${node} has no worker running`);
    if (!harnessToolList(cell.worker.grants).includes(tool)) throw new Error(`${tool} is not allowed for ${cell.module}`);
    const ctx = cell.ctx;
    const w = cell.worker;
    const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");
    // files a worker hands over must be ones it could have written
    const own = (p: string) => {
      const f = resolve(w.cwd, p);
      if (![w.cwd, this.log.dir, ...w.grants.writeDirs].some((d) => f === d || inside(f, d))) throw new Error(`${p} is outside the folders this worker may write`);
      return f;
    };
    switch (tool) {
      case "report_step":
        ctx.step(str("title") || "Working", str("detail") || undefined, str("icon") || undefined);
        return { ok: true };
      case "attach_evidence": {
        const f = own(str("path"));
        return { uri: await ctx.evidence((str("kind") || kindOf(f)) as EvidenceKind, f, str("caption") || basename(f)) };
      }
      case "publish_output": {
        const f = own(str("path"));
        return { uri: await ctx.output(str("name") || basename(f), f, str("kind") || "file", str("href") || undefined) };
      }
      case "spawn_task": {
        const label = str("label") || "Sub-task";
        // a named module runs with its own allow block; otherwise a sub-worker with the caller's limits
        const named = str("module");
        const mod = named ? this.runner.d.mods.get(named) : undefined;
        if (named && !mod) throw new Error(`no installed module "${named}"`);
        const out = await this.runCell(this.childId(node, label), node, mod ?? { manifest: subAgent(cell.manifest), dir: "", hasRun: false, fixtures: [] }, label, { prompt: str("prompt") });
        return { summary: out.summary, files: (out.files ?? []).map((f) => ({ ...f, path: join(this.log.dir, f.uri) })) };
      }
      case "request_asset": {
        const kind = str("kind") || "image";
        const refs = Array.isArray(args.refs) ? (args.refs as string[]).map(own) : [];
        const out = await ctx.request(this.cfg.assetKinds[kind] ?? `assets.${kind}`, { prompt: str("prompt"), refs, params: { kind } });
        return { summary: out.summary, files: (out.files ?? []).map((f) => ({ ...f, path: join(this.log.dir, f.uri) })) };
      }
      default:
        throw new Error(`unknown tool ${tool}`);
    }
  }
}

function writeJson(file: string, v: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  createWriteStream(file).end(JSON.stringify(v, null, 2));
}

export { repoRoot };
