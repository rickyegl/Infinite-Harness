// Run store: runs/<id>/events.jsonl (append, fsync per event), runs/<id>/artifacts/, runs/<id>/meta.json.
// Restart-safe: on open, a run whose meta still says "running" was interrupted. It is closed with a
// node.error on every unfinished cell and run.done, and marked failed. It is never resumed silently.

import { parseJsonl, type HarnessEvent, type Payload } from "@harness/protocol";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, truncateSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";

export type RunState = "running" | "done" | "failed";
export type RunMeta = {
  id: string;
  prompt: string;
  /** wall clock ms of t = 0 */
  startedAt: number;
  state: RunState;
  endedAt?: number;
  /** seq of the last event written */
  lastSeq: number;
  error?: string;
};

/** Distributes a Payload over Base fields without collapsing the union. */
export type NewEvent = Payload & { node: string };

export class RunStore {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
    mkdirSync(root, { recursive: true });
  }

  dir(id: string): string {
    return join(this.root, id);
  }
  artifacts(id: string): string {
    return join(this.root, id, "artifacts");
  }

  newId(now = Date.now()): string {
    const d = new Date(now);
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    const base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    let id = base;
    for (let k = 2; existsSync(this.dir(id)); k++) id = `${base}-${k}`;
    return id;
  }

  create(prompt: string, now = Date.now()): RunLog {
    const id = this.newId(now);
    mkdirSync(this.artifacts(id), { recursive: true });
    const meta: RunMeta = { id, prompt, startedAt: now, state: "running", lastSeq: 0 };
    this.writeMeta(meta);
    return new RunLog(this, meta);
  }

  /** Reopens a finished run for a follow-up (`/say`). */
  reopen(id: string): RunLog {
    const meta = this.meta(id);
    if (!meta) throw new Error(`no run ${id}`);
    meta.state = "running";
    delete meta.endedAt;
    this.writeMeta(meta);
    return new RunLog(this, meta);
  }

  meta(id: string): RunMeta | null {
    const f = join(this.dir(id), "meta.json");
    if (!existsSync(f)) return null;
    return JSON.parse(readFileSync(f, "utf8")) as RunMeta;
  }

  writeMeta(meta: RunMeta): void {
    const f = join(this.dir(meta.id), "meta.json");
    writeFileSync(f + ".tmp", JSON.stringify(meta, null, 2));
    renameSync(f + ".tmp", f);
  }

  events(id: string): HarnessEvent[] {
    const f = join(this.dir(id), "events.jsonl");
    if (!existsSync(f)) return [];
    return parseJsonl(tolerateTornTail(readFileSync(f, "utf8")));
  }

  list(): RunMeta[] {
    return readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => this.meta(d.name))
      .filter((m): m is RunMeta => !!m)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Called once at bridge start: closes every run a previous process left running. */
  recover(now = Date.now()): string[] {
    const closed: string[] = [];
    for (const m of this.list()) {
      if (m.state !== "running") continue;
      const events = this.events(m.id);
      const log = new RunLog(this, { ...m, lastSeq: events.reduce((x, e) => Math.max(x, e.seq), 0) }, events);
      const open = new Set<string>();
      for (const e of events) {
        if (e.type === "node.spawn") open.add(e.node);
        if (e.type === "node.done" || e.type === "node.error") open.delete(e.node);
        if (e.type === "node.state" && (e.state === "done" || e.state === "failed")) open.delete(e.node);
      }
      const t = Math.max(log.lastT, now - m.startedAt);
      for (const node of [...open].reverse()) log.append({ type: "node.error", node, message: "interrupted: the bridge stopped during this run" }, t);
      log.append({ type: "run.done", node: "root" }, t);
      log.close("failed", "interrupted: the bridge stopped during this run");
      closed.push(m.id);
    }
    return closed;
  }
}

/** A crash can leave half a line at the end; drop it rather than refuse the whole log. */
function tolerateTornTail(text: string): string {
  if (text.endsWith("\n") || !text.length) return text;
  const i = text.lastIndexOf("\n");
  const tail = text.slice(i + 1);
  try {
    JSON.parse(tail);
    return text;
  } catch {
    return text.slice(0, i + 1);
  }
}

type Listener = (e: HarnessEvent) => void;

/** One run's append-only log. Assigns seq and t, writes and fsyncs each event, then notifies listeners. */
export class RunLog {
  readonly store: RunStore;
  readonly meta: RunMeta;
  private fd: number;
  private seq: number;
  lastT = 0;
  private listeners = new Set<Listener>();
  /** every event of this run, in seq order */
  readonly events: HarnessEvent[];

  constructor(store: RunStore, meta: RunMeta, existing?: HarnessEvent[]) {
    this.store = store;
    this.meta = meta;
    this.events = existing ?? store.events(meta.id);
    this.seq = this.events.reduce((m, e) => Math.max(m, e.seq), meta.lastSeq);
    this.lastT = this.events.reduce((m, e) => Math.max(m, e.t), 0);
    const file = join(store.dir(meta.id), "events.jsonl");
    // a torn last line (crash mid-write) is cut off before appending, or the next event would join it
    if (existsSync(file)) {
      const buf = readFileSync(file);
      const keep = Buffer.byteLength(tolerateTornTail(buf.toString("utf8")), "utf8");
      if (keep < buf.length) truncateSync(file, keep);
      this.fd = openSync(file, "a");
      if (keep > 0 && buf[keep - 1] !== 0x0a) writeSync(this.fd, "\n");
    } else this.fd = openSync(file, "a");
  }

  get id(): string {
    return this.meta.id;
  }
  get dir(): string {
    return this.store.dir(this.meta.id);
  }

  /** ms since run start, never going backwards */
  now(): number {
    return Math.max(this.lastT, Date.now() - this.meta.startedAt);
  }

  append(p: NewEvent, t = this.now()): HarnessEvent {
    const ev = { seq: ++this.seq, t: Math.max(this.lastT, Math.round(t)), run: this.meta.id, ...p } as HarnessEvent;
    writeSync(this.fd, JSON.stringify(ev) + "\n");
    fsyncSync(this.fd);
    this.lastT = ev.t;
    this.events.push(ev);
    this.meta.lastSeq = ev.seq;
    for (const fn of this.listeners) fn(ev);
    return ev;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  close(state: RunState, error?: string): void {
    this.meta.state = state;
    this.meta.endedAt = Date.now();
    if (error) this.meta.error = error;
    this.store.writeMeta(this.meta);
    try {
      closeSync(this.fd);
    } catch {
      /* already closed */
    }
  }
}
