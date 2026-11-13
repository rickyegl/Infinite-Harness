// Router: prompt + module summaries -> a strict JSON plan. First choice: the proxy's chat-completions with
// a JSON schema (config proxy.routerModel). Fallback: one headless worker call (config router.worker) with
// the same schema. The instructions live in apps/bridge/router.md.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholder, repoRoot, type HarnessConfig } from "./config.ts";
import type { ModuleSummary } from "./modules.ts";
import { runWorker } from "./workers/index.ts";

export type PlanNode = { id: string; module: string; label: string; prompt: string; after: string[]; under: string | null };
export type Plan = { nodes: PlanNode[] };
export type Existing = { id: string; module: string; label: string };
export type RouteResult = { plan: Plan; backend: "proxy" | "worker" | "recorded"; ms: number };

export const ROUTER_MD = join(repoRoot, "apps", "bridge", "router.md");
export const RECORDED = join(repoRoot, "apps", "bridge", "fixtures", "router");

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nodes"],
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "module", "label", "prompt", "after", "under"],
        properties: {
          id: { type: "string" },
          module: { type: "string" },
          label: { type: "string" },
          prompt: { type: "string" },
          after: { type: "array", items: { type: "string" } },
          under: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/** What is wrong with a plan, or null. */
export function checkPlan(p: unknown, modules: Iterable<string>, existing: Existing[] = []): string | null {
  if (!p || typeof p !== "object" || !Array.isArray((p as Plan).nodes)) return "no nodes list";
  const nodes = (p as Plan).nodes;
  if (!nodes.length) return "empty plan";
  const mods = new Set(modules);
  const old = new Set(existing.map((e) => e.id));
  const ids = new Set<string>();
  for (const n of nodes) {
    if (typeof n.id !== "string" || !/^[a-z0-9][a-z0-9.-]*$/.test(n.id)) return `bad id ${JSON.stringify(n.id)}`;
    if (ids.has(n.id) || old.has(n.id)) return `duplicate id ${n.id}`;
    ids.add(n.id);
    if (!mods.has(n.module)) return `${n.id}: unknown module ${n.module}`;
    if (typeof n.label !== "string" || !n.label.trim()) return `${n.id}: empty label`;
    if (typeof n.prompt !== "string" || !n.prompt.trim()) return `${n.id}: empty prompt`;
    if (!Array.isArray(n.after)) return `${n.id}: after must be a list`;
    if (n.under !== null && n.under !== undefined && !old.has(n.under)) return `${n.id}: under ${n.under} is not an existing cell`;
  }
  for (const n of nodes) for (const a of n.after) if (!ids.has(a)) return `${n.id}: after ${a} is not in the plan`;
  // cycle check (depth-first, three colours)
  const by = new Map(nodes.map((n) => [n.id, n]));
  const mark = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (mark.get(id) === 2) return false;
    if (mark.get(id) === 1) return true;
    mark.set(id, 1);
    for (const a of by.get(id)!.after) if (visit(a)) return true;
    mark.set(id, 2);
    return false;
  };
  for (const n of nodes) if (visit(n.id)) return `cycle through ${n.id}`;
  return null;
}

export const normalizePrompt = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();
export const promptKey = (prompt: string, existing: Existing[] = []): string =>
  createHash("sha256").update(normalizePrompt(prompt) + "\n" + existing.map((e) => e.id).sort().join(",")).digest("hex").slice(0, 16);

export type Recorded = { prompt: string; existing: Existing[]; catalog: string[]; backend: "proxy" | "worker"; modelKey: string; ms: number; recordedAt: string; plan: Plan };

/** Recorded router outputs (real calls, saved by `pnpm --filter bridge record:router`). */
export function loadRecorded(dir = RECORDED): Map<string, Recorded> {
  const out = new Map<string, Recorded>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as Recorded;
    out.set(promptKey(r.prompt, r.existing), r);
  }
  return out;
}

const userMessage = (prompt: string, modules: ModuleSummary[], existing: Existing[]) =>
  JSON.stringify({ modules, existing, prompt }, null, 1);

export async function viaProxy(cfg: HarnessConfig, prompt: string, modules: ModuleSummary[], existing: Existing[], signal?: AbortSignal): Promise<Plan> {
  const p = cfg.proxy;
  if (isPlaceholder(p.routerModel)) throw new Error("proxy.routerModel is not set");
  const key = process.env[p.apiKeyEnv];
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    signal: AbortSignal.any([AbortSignal.timeout(cfg.router.timeoutMs), ...(signal ? [signal] : [])]),
    body: JSON.stringify({
      model: p.routerModel,
      messages: [
        { role: "system", content: readFileSync(ROUTER_MD, "utf8") },
        { role: "user", content: userMessage(prompt, modules, existing) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "plan", strict: true, schema: PLAN_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`proxy answered ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error("proxy returned no content");
  return JSON.parse(text) as Plan;
}

export async function viaWorker(cfg: HarnessConfig, prompt: string, modules: ModuleSummary[], existing: Existing[], workDir: string, signal?: AbortSignal): Promise<Plan> {
  const name = cfg.router.worker;
  const w = cfg.workers[name];
  if (!w || isPlaceholder(w.cmd)) throw new Error(`workers.${name} is not configured`);
  mkdirSync(workDir, { recursive: true });
  const out = await runWorker({
    name,
    cfg: w,
    prompt: `${readFileSync(ROUTER_MD, "utf8")}\n\nDo not use any tool. Here is the input:\n\n${userMessage(prompt, modules, existing)}`,
    cwd: workDir,
    grants: { harness: [], servers: {}, shell: false, web: false, writeDirs: [], network: [] },
    manifest: { id: "router", allow: {} },
    harnessMcp: null,
    schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
    timeoutMs: cfg.router.timeoutMs,
    signal: signal ?? new AbortController().signal,
    onStep: () => {},
    onFile: () => {},
  });
  if (!out.ok) throw new Error(`router worker: ${out.error}`);
  return out.json as Plan;
}

/** Normalizes the optional fields so the rest of the bridge can rely on them. */
const tidy = (p: Plan): Plan => ({ nodes: p.nodes.map((n) => ({ ...n, after: n.after ?? [], under: n.under ?? null })) });

export async function route(
  cfg: HarnessConfig,
  prompt: string,
  modules: ModuleSummary[],
  opts: { existing?: Existing[]; workDir: string; signal?: AbortSignal; useRecorded?: boolean; noProxy?: boolean },
): Promise<RouteResult> {
  const existing = opts.existing ?? [];
  const ids = modules.map((m) => m.id);
  const t0 = Date.now();
  if (opts.useRecorded) {
    const r = loadRecorded().get(promptKey(prompt, existing));
    if (r && !checkPlan(r.plan, ids, existing)) return { plan: tidy(r.plan), backend: "recorded", ms: 0 };
  }
  const errors: string[] = [];
  if (!opts.noProxy) {
    try {
      const plan = tidy(await viaProxy(cfg, prompt, modules, existing, opts.signal));
      const bad = checkPlan(plan, ids, existing);
      if (!bad) return { plan, backend: "proxy", ms: Date.now() - t0 };
      errors.push(`proxy plan: ${bad}`);
    } catch (e) {
      errors.push(`proxy: ${(e as Error).message}`);
    }
  }
  try {
    const plan = tidy(await viaWorker(cfg, prompt, modules, existing, opts.workDir, opts.signal));
    const bad = checkPlan(plan, ids, existing);
    if (!bad) return { plan, backend: "worker", ms: Date.now() - t0 };
    errors.push(`worker plan: ${bad}`);
  } catch (e) {
    errors.push((e as Error).message);
  }
  throw new Error(`no plan: ${errors.join("; ")}`);
}
