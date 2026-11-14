// The one config import for all bridge and module code. Merges harness.config.example.json (committed
// template) with harness.local.json (gitignored, real paths and names). Code never reads paths, CLI
// commands, model ids or ports from anywhere else.

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export type WorkerAdapter = "stream-json" | "exec-jsonl";

export type WorkerConfig = {
  /** which event protocol the CLI speaks; picks the adapter */
  adapter: WorkerAdapter;
  /** executable (absolute path or a name on PATH) */
  cmd: string;
  /** extra arguments placed before the adapter's own */
  args: string[];
  model?: string;
  /** reasoning effort hint, passed through when the CLI supports it */
  effort?: string;
  /** hard wall-clock limit per worker call */
  timeoutMs: number;
  /** stream-json adapter: MCP servers a module may name in allow.tools (the exec-jsonl adapter reads the CLI's own config) */
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
};

export type HarnessConfig = {
  bridge: {
    port: number; host: string; runsDir: string; tokenFile: string;
    /** exact page origins (besides loopback) that may call the bridge with the token: the deployed site */
    origins?: string[];
  };
  /** the deployed site (pnpm site:deploy) */
  site?: { project: string; url: string };
  proxy: {
    baseUrl: string;
    apiKeyEnv: string;
    routerModel: string;
    /** the router model the tests and record:router use instead of routerModel (cheaper, faster) */
    testModel?: string;
    /** a file that holds the proxy key (the proxy's own config), read when the env variable is not set */
    keyFile?: string;
    /** the field in keyFile; default "api-keys" */
    keyField?: string;
    imageModel: string;
    /** the proxy's own sign-in page, opened by "Connect your AI subscription" */
    signInUrl: string;
    timeoutMs: number;
  };
  router: { worker: string; timeoutMs: number };
  workers: Record<string, WorkerConfig>;
  defaultWorker: string;
  mock: { enabled: boolean; speed: number };
  /** request_asset kind -> module id */
  assetKinds: Record<string, string>;
  paths: Record<string, string>;
  colab: { session: string; gpu: string; keepAlive: boolean };
  roblox?: { studioPlace: string };
  voice: { envFile: string; account?: { use: string; as: string } };
  brandDenyList: string[];
};

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isObj(x: unknown): x is Record<string, Json> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Deep merge: objects merge key by key, everything else (arrays included) is replaced. */
export function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith("_")) continue;
    out[k] = k in out ? merge(out[k], v) : v;
  }
  return out as T;
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

export function loadConfig(root = repoRoot, env: NodeJS.ProcessEnv = process.env): HarnessConfig {
  const example = readJson(join(root, "harness.config.example.json"));
  const localFile = env.HARNESS_CONFIG ?? join(root, "harness.local.json");
  const local = existsSync(localFile) ? readJson(localFile) : {};
  const c = merge(example as HarnessConfig, local);
  // environment switches documented in the plans
  if (env.HARNESS_MOCK === "1") c.mock = { ...c.mock, enabled: true };
  if (env.HARNESS_MOCK === "0") c.mock = { ...c.mock, enabled: false };
  if (env.HARNESS_MOCK_SPEED) c.mock = { ...c.mock, speed: Number(env.HARNESS_MOCK_SPEED) || 1 };
  if (env.HARNESS_PORT) c.bridge = { ...c.bridge, port: Number(env.HARNESS_PORT) };
  if (env.HARNESS_RUNS) c.bridge = { ...c.bridge, runsDir: env.HARNESS_RUNS };
  for (const w of Object.values(c.workers)) {
    w.args ??= [];
    w.timeoutMs ??= 30 * 60_000;
  }
  // the proxy key: from the environment, else read by path from the proxy's own config file (never copied,
  // printed or logged; it only lives in this process's environment, where the router reads it)
  const kf = c.proxy.keyFile;
  if (!env[c.proxy.apiKeyEnv] && kf && !isPlaceholder(kf)) {
    const key = readKeyFile(abs(kf, root), c.proxy.keyField ?? "api-keys");
    if (key) env[c.proxy.apiKeyEnv] = key;
  }
  return c;
}

/** The first value of `field` in a TOML/env-style file: `field = "k"`, `field = ["k", ...]` or `field=k`. */
export function readKeyFile(file: string, field: string): string | null {
  if (!existsSync(file)) return null;
  const esc = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^\\s*${esc}\\s*[=:]\\s*(.+)$`, "m").exec(readFileSync(file, "utf8"));
  if (!m) return null;
  const v = m[1].trim();
  const q = /["']([^"']+)["']/.exec(v);
  return q ? q[1] : v.replace(/^\[|\]$/g, "").trim() || null;
}

/** Absolute path for a config path that may be relative to the repo. */
export const abs = (p: string, root = repoRoot): string => (isAbsolute(p) ? p : join(root, p));

/** True when a config value is still the template's "<placeholder>". */
export const isPlaceholder = (v: unknown): boolean => typeof v === "string" && /^<.*>$/.test(v);

let cached: HarnessConfig | null = null;
export function config(): HarnessConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
/** tests: replace the cached config */
export function setConfig(c: HarnessConfig | null): void {
  cached = c;
}

/** The config the tests route with: proxy.testModel, when set, stands in for proxy.routerModel. */
export function withTestModel(c: HarnessConfig): HarnessConfig {
  const m = c.proxy.testModel;
  return m && !isPlaceholder(m) ? { ...c, proxy: { ...c.proxy, routerModel: m } } : c;
}
