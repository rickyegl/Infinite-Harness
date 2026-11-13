// Module loader: discovers modules/*/module.json, validates each against the protocol types and the
// `allow` vocabulary, and loads run.ts on first use.
//
// `allow` vocabulary (contract, "Module contract"; enforced by the worker adapters, see workers/allow.ts):
//   tools    "harness.*" or "harness.<tool>"      the bridge's own MCP server
//            "<server>.*" or "<server>.<tool>"    an MCP server from the worker CLI's own config
//            "shell"                              run commands (needs network ["*"]: a shell here reaches any host)
//            "web"                                fetch pages / search
//   write    "$RUN" (whole run folder), "$NODE" (this cell's artifact folder), "$paths.<key>" (a config path),
//            or a repo-relative folder. The worker's own working folder is always writable.
//   network  host names, "proxy" (the local model proxy, for scripts), or "*" (anything)

import { checkManifest, type ModuleManifest, type ModuleRun } from "@harness/protocol";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./config.ts";

export type LoadedModule = {
  manifest: ModuleManifest;
  dir: string;
  hasRun: boolean;
  fixtures: string[];
};

const BUILTIN_TOOLS = new Set(["shell", "web"]);

/** Returns what is wrong with a manifest's allow block, or null. */
export function checkAllow(m: ModuleManifest): string | null {
  const a = m.allow;
  for (const k of ["tools", "write", "network"] as const) {
    if (a[k] !== undefined && (!Array.isArray(a[k]) || a[k]!.some((x) => typeof x !== "string"))) return `allow.${k} must be a list of strings`;
  }
  for (const t of a.tools ?? []) {
    if (BUILTIN_TOOLS.has(t)) continue;
    if (!/^[A-Za-z0-9_-]+\.(\*|[A-Za-z0-9_-]+)$/.test(t)) return `allow.tools: "${t}" is not "<server>.<tool>", "<server>.*", shell or web`;
  }
  for (const w of a.write ?? []) {
    if (w.startsWith("$") && !/^\$(RUN|NODE|paths\.[A-Za-z0-9_]+)$/.test(w)) return `allow.write: unknown "${w}"`;
    if (!w.startsWith("$") && (w.includes("..") || /^[A-Za-z]:|^\//.test(w))) return `allow.write: "${w}" must be repo-relative or a $ name`;
  }
  const net = a.network ?? [];
  if ((a.tools ?? []).includes("shell") && !net.includes("*")) {
    return 'allow.tools has "shell" but allow.network is not ["*"]: a shell on this machine can reach any host, so say so';
  }
  return null;
}

export function loadModules(root = join(repoRoot, "modules")): Map<string, LoadedModule> {
  const out = new Map<string, LoadedModule>();
  if (!existsSync(root)) return out;
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = join(root, d.name);
    const mf = join(dir, "module.json");
    if (!existsSync(mf)) continue;
    let m: ModuleManifest;
    try {
      m = JSON.parse(readFileSync(mf, "utf8"));
    } catch (e) {
      console.warn(`modules/${d.name}: module.json is not JSON (${(e as Error).message}); skipped`);
      continue;
    }
    const problem = checkManifest(m) ?? checkAllow(m);
    if (problem) {
      console.warn(`modules/${d.name}: ${problem}; skipped`);
      continue;
    }
    if (out.has(m.id)) {
      console.warn(`modules/${d.name}: duplicate id ${m.id}; skipped`);
      continue;
    }
    const fx = join(dir, "fixtures");
    const fixtures = existsSync(fx) ? readdirSync(fx).filter((f) => f.endsWith(".jsonl")).sort() : [];
    out.set(m.id, { manifest: m, dir, hasRun: existsSync(join(dir, "run.ts")), fixtures });
  }
  return out;
}

const runCache = new Map<string, Promise<ModuleRun>>();

export function loadRun(mod: LoadedModule): Promise<ModuleRun> {
  const file = join(mod.dir, "run.ts");
  if (!runCache.has(file)) {
    runCache.set(
      file,
      import(pathToFileURL(file).href).then((x) => {
        if (typeof x.default !== "function") throw new Error(`${mod.manifest.id}: run.ts has no default export`);
        return x.default as ModuleRun;
      }),
    );
  }
  return runCache.get(file)!;
}

/** What the router reads about each module. */
export type ModuleSummary = Pick<ModuleManifest, "id" | "label" | "kind" | "summary" | "accepts" | "produces">;
export const summaries = (mods: Iterable<LoadedModule>): ModuleSummary[] =>
  [...mods].map(({ manifest: m }) => ({ id: m.id, label: m.label, kind: m.kind, summary: m.summary, accepts: m.accepts, produces: m.produces }));
