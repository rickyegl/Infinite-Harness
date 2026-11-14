// The asset forge on its Colab runtime, shared by every module in this bridge process that needs it.
//
// forgeSession() attaches to a forge that already answers on the local port, or starts one with the forge's own
// launcher (modules/_shared/forge.ps1 runs launcher/colab-launcher.sh in WSL: runtime, code, server, then the
// keep-alive and the port forward). Each caller releases its session when done; when the last one has, a runtime
// this process started is stopped (it uses compute units) unless colab.keepAlive is set. A runtime that was
// already running when we attached is left as it was.
//
// The forge's access token is printed by the launcher into its log (outside the repo); it is read from there and
// only ever sent as the Authorization header. Nothing here prints or stores it.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "state"), "ColabLauncher", "harness");
const UP_LOG = join(STATE, "up.log");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Forge {
  url: string;
  /** GET/POST the forge API (path starts with /api or /files) */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  json<T = any>(path: string, body?: unknown): Promise<T>;
  /** download /files/<rel> to a local file */
  download(rel: string, file: string): Promise<string>;
  /** reopen the port forward after it dropped (the runtime keeps running); true when the forge answers again */
  reconnect(): Promise<boolean>;
  release(): void;
}

interface Shared {
  ready: Promise<{ url: string; token: string }>;
  users: number;
  started: boolean;
  stopTimer?: ReturnType<typeof setTimeout>;
}
let shared: Shared | null = null;

function readToken(): string {
  if (!existsSync(UP_LOG)) return "";
  const m = [...readFileSync(UP_LOG, "utf8").matchAll(/token=([A-Za-z0-9_\-]+)/g)].pop();
  return m?.[1] ?? "";
}

async function healthy(url: string, token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const r = await fetch(`${url}/api/system`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** A launcher progress line ("== ... ==") as a neutral stage, without package or weight names. */
export function setupStage(line: string): string {
  const s = line.replace(/^==\s*|\s*==\s*$/g, "");
  const n = /^\[(\d+)\/(\d+)\]/.exec(s);
  if (n) return n[1] === "0" ? "downloading the weights" : `installing, part ${n[1]} of ${n[2]}`;
  if (/^creating/i.test(s)) return "asking for a GPU runtime";
  if (/^runtime ready/i.test(s)) return "runtime ready";
  if (/^uploading/i.test(s)) return "uploading the code";
  if (/^setting up/i.test(s)) return "installing packages and weights (about 10 minutes)";
  return "working";
}

function launcher(config: Record<string, any>, action: string, log: string): void {
  const forge = config.paths?.forge;
  if (!forge || !existsSync(join(forge, "launcher", "colab-launcher.sh"))) throw new Error("paths.forge is not set to the asset forge project");
  const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve(HERE, "forge.ps1"), "-Action", action, "-Forge", forge, "-Log", log, "-LocalPort", String(port(config))], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`forge launcher ${action} failed: ${(r.stderr || r.stdout).split("\n")[0]}`);
}

const port = (config: Record<string, any>) => Number(config.colab?.forgePort ?? 8765);

async function start(config: Record<string, any>, say: (t: string, d?: string) => void, signal: AbortSignal): Promise<{ url: string; token: string; started: boolean }> {
  const url = `http://127.0.0.1:${port(config)}`;
  if (await healthy(url, readToken())) return { url, token: readToken(), started: false };
  // the runtime may still be up with only the port forward gone
  if (readToken() && /REMOTE \d+/.test(readFileSync(UP_LOG, "utf8"))) {
    say("Reconnecting to the asset forge", "opening the port forward again");
    launcher(config, "tunnel", join(STATE, "tunnel.log"));
    for (let i = 0; i < 20; i++) {
      await sleep(1500);
      if (await healthy(url, readToken())) return { url, token: readToken(), started: false };
    }
  }
  say("Starting the asset forge", "a GPU runtime on Colab: install, weights, server (10 to 20 minutes the first time)");
  mkdirSync(STATE, { recursive: true });
  writeFileSync(UP_LOG, "");
  launcher(config, "up", UP_LOG);
  const t0 = Date.now();
  let told = "";
  while (!/^REMOTE \d+/m.test(readFileSync(UP_LOG, "utf8"))) {
    if (signal.aborted) throw new Error("stopped");
    if (Date.now() - t0 > 45 * 60_000) throw new Error("the forge did not come up in 45 minutes");
    const last = readFileSync(UP_LOG, "utf8").split("\n").filter((l) => /^== /.test(l)).pop();
    // the launcher's own lines name packages and weights; the cell shows only the stage
    const stage = last ? setupStage(last) : "";
    if (stage && stage !== told) say("Setting up the forge", (told = stage));
    await sleep(15_000);
  }
  launcher(config, "keepalive", join(STATE, "keepalive.log"));
  launcher(config, "tunnel", join(STATE, "tunnel.log"));
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    if (await healthy(url, readToken())) return { url, token: readToken(), started: true };
  }
  throw new Error("the forge started but does not answer on the forwarded port");
}

/** one reconnect at a time for every caller in this process */
let reopening: Promise<boolean> | null = null;
function reopen(config: Record<string, any>, url: string, say: (t: string, d?: string) => void): Promise<boolean> {
  reopening ??= (async () => {
    try {
      if (await healthy(url, readToken())) return true;
      say("Reconnecting to the asset forge", "the port forward dropped; opening it again");
      launcher(config, "tunnel", join(STATE, "tunnel.log"));
      for (let i = 0; i < 20; i++) {
        await sleep(1500);
        if (await healthy(url, readToken())) return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      reopening = null;
    }
  })();
  return reopening;
}

/**
 * Is a forge runtime up (for `pnpm stop`'s reminder)? "up" when it answers on the forwarded port; "maybe" when
 * the launcher's log shows a runtime that was started and never stopped, but the forward is gone.
 */
export async function forgeStatus(config: Record<string, any>): Promise<"up" | "maybe" | "no"> {
  if (await healthy(`http://127.0.0.1:${port(config)}`, readToken())) return "up";
  if (!existsSync(UP_LOG) || !/^REMOTE \d+/m.test(readFileSync(UP_LOG, "utf8"))) return "no";
  const stopLog = join(STATE, "stop.log");
  return existsSync(stopLog) && statSync(stopLog).mtimeMs > statSync(UP_LOG).mtimeMs ? "no" : "maybe";
}

/** stop a runtime this process started; the launcher's stop also ends the keep-alive and the forward */
function stopForge(config: Record<string, any>): void {
  try {
    launcher(config, "stop", join(STATE, "stop.log"));
  } catch (e) {
    console.warn(`forge stop: ${(e as Error).message}`);
  }
}

export async function forgeSession(ctx: { config: Record<string, any>; signal: AbortSignal; step: (t: string, d?: string, icon?: string) => void }): Promise<Forge> {
  const say = (t: string, d?: string) => ctx.step(t, d, "chip");
  if (!shared) {
    const s: Shared = { users: 0, started: false, ready: null as any };
    s.ready = start(ctx.config, say, ctx.signal).then((r) => {
      s.started = r.started;
      return r;
    });
    s.ready.catch(() => {
      if (shared === s) shared = null;
    });
    shared = s;
  }
  const s = shared;
  s.users++;
  if (s.stopTimer) clearTimeout(s.stopTimer), (s.stopTimer = undefined);
  let conn: { url: string; token: string };
  try {
    conn = await s.ready;
  } catch (e) {
    s.users--;
    throw e;
  }
  const headers = (extra?: RequestInit["headers"]) => ({ authorization: `Bearer ${conn.token}`, ...(extra as Record<string, string>) });
  let released = false;
  const forge: Forge = {
    url: conn.url,
    fetch: (path, init = {}) => fetch(`${conn.url}${path}`, { ...init, headers: headers(init.headers), signal: init.signal ?? ctx.signal }),
    async json<T = any>(path: string, body?: unknown): Promise<T> {
      const r = await forge.fetch(path, body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
      if (!r.ok) throw new Error(`forge ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      return (await r.json()) as T;
    },
    async download(rel, file) {
      const r = await forge.fetch(`/files/${rel.split("/").map(encodeURIComponent).join("/")}`);
      if (!r.ok) throw new Error(`forge file ${rel}: ${r.status}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    },
    reconnect: () => reopen(ctx.config, conn.url, say),
    release() {
      if (released) return;
      released = true;
      s.users--;
      if (s.users > 0 || !s.started || ctx.config.colab?.keepAlive) return;
      // a short grace period, so requests that arrive one after another share the runtime
      s.stopTimer = setTimeout(() => {
        if (s.users > 0 || shared !== s) return;
        shared = null;
        stopForge(ctx.config);
      }, 90_000);
      s.stopTimer.unref?.();
    },
  };
  return forge;
}
