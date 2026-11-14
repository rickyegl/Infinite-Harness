// Public addresses for this computer: a quick tunnel (cloudflared, no account) in front of the bridge's own
// server, so one address carries a game build (/runs/<id>/artifacts/webgl/), the crossplay relay (/relay/<room>)
// and, with the pairing token, the bridge API for the site on another device.
//
// One tunnel per local target, shared by every run that asks for it. A run that asked is an owner; the tunnel
// closes when its last owner releases it (run cancelled), when the bridge closes, or on `pnpm stop` (every pid
// is recorded in runs/.procs.json). A finished run keeps its tunnel, so its link keeps working.

import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:https";
import { abs, config } from "./config.ts";
import { addProc, alive, dropProc, killTree, procsFile, readProcs } from "./procs.ts";

const QUICK_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const REGISTERED = /Registered tunnel connection|Connection [0-9a-f-]+ registered/i;

export type Tunnel = {
  /** public https origin, no trailing slash */
  url: string;
  /** the local origin it forwards to */
  target: string;
  pid: number;
  kind: "quick";
};

type Open = Tunnel & { proc: ChildProcess; owners: Set<string>; ready: Promise<void> };

export class Tunnels {
  private open = new Map<string, Open>();
  private pending = new Map<string, Promise<Open>>();
  /** where pids are recorded; the bridge points this at its own runs folder */
  file = "";
  /** the cloudflared executable */
  exe = "";

  private procs() {
    return this.file || procsFile();
  }
  private bin() {
    return this.exe || exePath(config().paths.cloudflared ?? "cloudflared");
  }

  /** the open tunnel for a target, if any */
  get(target: string): Tunnel | undefined {
    const t = this.open.get(origin(target));
    return t && { url: t.url, target: t.target, pid: t.pid, kind: t.kind };
  }

  list(): (Tunnel & { owners: string[] })[] {
    return [...this.open.values()].map((t) => ({ url: t.url, target: t.target, pid: t.pid, kind: t.kind, owners: [...t.owners] }));
  }

  /**
   * Opens (or reuses) a tunnel to `target` for `owner` (a run id). Resolves once the tunnel is registered
   * at the edge; whether its address answers yet is `answered()`'s job (new names take a while to resolve).
   */
  async ensure(target: string, owner: string, opts: { signal?: AbortSignal; timeoutMs?: number; onLog?: (line: string) => void } = {}): Promise<Tunnel> {
    const key = origin(target);
    let t = this.open.get(key);
    if (!t || t.proc.exitCode !== null) {
      if (!this.pending.has(key)) this.pending.set(key, this.start(key, opts).finally(() => this.pending.delete(key)));
      t = await this.pending.get(key)!;
    }
    t.owners.add(owner);
    await t.ready;
    return { url: t.url, target: t.target, pid: t.pid, kind: t.kind };
  }

  private start(target: string, opts: { signal?: AbortSignal; timeoutMs?: number; onLog?: (line: string) => void }): Promise<Open> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.bin(), ["tunnel", "--no-autoupdate", "--url", target], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let url = "";
      let settled = false;
      let markReady: () => void = () => {};
      const ready = new Promise<void>((r) => (markReady = r));
      const fail = (e: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (proc.pid) {
          killTree(proc.pid);
          dropProc(proc.pid, this.procs());
        }
        reject(e);
      };
      const timer = setTimeout(() => fail(new Error("the tunnel did not come up in time")), opts.timeoutMs ?? 60_000);
      opts.signal?.addEventListener("abort", () => fail(new Error("cancelled")), { once: true });
      proc.on("error", (e) => fail(new Error(`cloudflared could not start: ${e.message}`)));
      proc.on("exit", (code) => {
        if (proc.pid) dropProc(proc.pid, this.procs());
        if (this.open.get(target)?.proc === proc) this.open.delete(target);
        fail(new Error(`cloudflared exited (${code})`));
      });
      let buf = "";
      const onData = (d: Buffer) => {
        buf += d.toString("utf8");
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          opts.onLog?.(line);
          const m = QUICK_URL.exec(line);
          if (m && !url && !/api\.trycloudflare/.test(m[0])) {
            url = m[0];
            const t: Open = { url, target, pid: proc.pid!, kind: "quick", proc, owners: new Set(), ready };
            this.open.set(target, t);
            addProc({ pid: proc.pid!, kind: "tunnel", what: `quick tunnel to ${target}`, url, startedAt: Date.now() }, this.procs());
          }
          if (url && REGISTERED.test(line) && !settled) {
            settled = true;
            clearTimeout(timer);
            markReady();
            resolve(this.open.get(target)!);
          }
        }
      };
      proc.stdout!.on("data", onData);
      proc.stderr!.on("data", onData);
    });
  }

  /** a run lets go; the tunnel closes when nobody holds it */
  release(owner: string): void {
    for (const [k, t] of this.open) {
      if (!t.owners.delete(owner) || t.owners.size) continue;
      this.stop(k);
    }
  }

  private stop(key: string): void {
    const t = this.open.get(key);
    if (!t) return;
    this.open.delete(key);
    killTree(t.pid);
    dropProc(t.pid, this.procs());
  }

  closeAll(): void {
    for (const k of [...this.open.keys()]) this.stop(k);
  }
}

/** the one tunnel manager of this process (modules import it; the bridge closes it) */
export const tunnels = new Tunnels();

const origin = (u: string) => new URL(u).origin;

/** a config executable: a bare name is looked up on PATH, a path is relative to the repo */
export const exePath = (p: string) => (/[\\/]/.test(p) ? abs(p) : p);

/** tunnels recorded by an earlier bridge that are still running (pnpm stop closes them) */
export function strayTunnels(file?: string) {
  return readProcs(file).filter((p) => p.kind === "tunnel" && alive(p.pid, "cloudflared"));
}

// ------------------------------------------------------------------ probing a fresh address

/** A records of a name over DNS-over-HTTPS, so a too-early lookup cached by this computer cannot hide a new name */
export async function resolveDoh(host: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const r = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=A`, {
      headers: { accept: "application/dns-json" }, signal: signal ?? AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
    return (j.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
  } catch {
    return [];
  }
}

export type Probe = { status: number; type: string; ip: string; ms: number; body?: Buffer };

/** one GET of a public https url, connecting to `ip` (from resolveDoh) with the real name for TLS and Host */
export function getVia(url: string, ip: string, opts: { timeoutMs?: number; body?: boolean } = {}): Promise<Probe> {
  const u = new URL(url);
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const req = request(
      { host: ip, servername: u.hostname, port: 443, path: u.pathname + u.search, method: "GET", headers: { host: u.hostname, "user-agent": "harness-probe" }, timeout: opts.timeoutMs ?? 15000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => opts.body && chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), ip, ms: Date.now() - t0, ...(opts.body ? { body: Buffer.concat(chunks) } : {}) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Polls a public url until it answers 200 (or a status in `accept`; a new quick-tunnel name can take a minute to resolve everywhere).
 * Returns the last probe, or null when it never answered within `timeoutMs`.
 */
export async function answered(url: string, opts: { timeoutMs?: number; signal?: AbortSignal; onTry?: (n: number, why: string) => void; accept?: number[] } = {}): Promise<Probe | null> {
  const end = Date.now() + (opts.timeoutMs ?? 150_000);
  const host = new URL(url).hostname;
  for (let n = 1; Date.now() < end && !opts.signal?.aborted; n++) {
    let why = "no address yet";
    const ips = await resolveDoh(host, opts.signal);
    for (const ip of ips) {
      try {
        const p = await getVia(url, ip);
        if (p.status === 200 || opts.accept?.includes(p.status)) return p;
        why = `answered ${p.status}`;
      } catch (e) {
        why = (e as Error).message;
      }
    }
    opts.onTry?.(n, why);
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}
