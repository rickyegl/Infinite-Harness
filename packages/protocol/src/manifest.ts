// Module manifest (modules/<id>/module.json). Mirrors "Module contract" in plan/00-contract.md.

import type { EvidenceKind, NodeKind } from "./events.ts";

export type ModuleManifest = {
  id: string;
  /** capability word printed in the UI, never a vendor */
  label: string;
  icon: string;
  kind: Exclude<NodeKind, "root">;
  /** only for non-LLM generators, and only on kind "tool" */
  maker?: string;
  /** read by the router */
  summary: string;
  accepts: string[];
  produces: (EvidenceKind | string)[];
  runtime: "script" | "cli-agent";
  needs?: string[];
  /** a part of another module: spawned by its parent's run.ts, never offered to the router */
  hidden?: boolean;
  mock: boolean;
  /** hard limits enforced by the worker adapter; anything not listed is denied */
  allow: { tools?: string[]; write?: string[]; network?: string[] };
};

export type ModuleInput = { prompt: string; refs?: string[]; params?: Record<string, unknown> };
export type ModuleOutput = { summary: string; files?: { name: string; uri: string; kind: string }[] };

/** Returns a description of what is wrong with a manifest, or null. */
export function checkManifest(m: unknown): string | null {
  if (!m || typeof m !== "object") return "not an object";
  const x = m as Record<string, unknown>;
  for (const k of ["id", "label", "icon", "kind", "summary", "runtime"]) {
    if (typeof x[k] !== "string") return `${k} must be a string`;
  }
  if (!["orchestrator", "agent", "tool"].includes(x.kind as string)) return `bad kind ${String(x.kind)}`;
  if (x.maker !== undefined && x.kind !== "tool") return "only kind \"tool\" may set maker";
  if (!Array.isArray(x.accepts) || !Array.isArray(x.produces)) return "accepts and produces must be arrays";
  if (typeof x.mock !== "boolean") return "mock must be a boolean";
  if (x.hidden !== undefined && typeof x.hidden !== "boolean") return "hidden must be a boolean";
  if (!x.allow || typeof x.allow !== "object") return "allow is required";
  return null;
}

// ---------- what a module's run.ts receives (contract, "Module contract") ----------

export type AgentOptions = {
  /** worker name from config `workers.<name>`; default: config `defaultWorker` */
  worker?: string;
  /** a project folder to work in instead of a fresh folder inside the run */
  cwd?: string;
  /** JSON schema for the final answer; the result's `json` holds the parsed value */
  schema?: Record<string, unknown>;
  timeoutMs?: number;
};
export type AgentResult = {
  ok: boolean;
  /** the worker's final text */
  text: string;
  /** parsed final answer when `schema` was given */
  json?: unknown;
  /** files the worker wrote, absolute paths */
  files: string[];
  /** the worker's working directory */
  cwd: string;
};
export type ShResult = { code: number; stdout: string; stderr: string };

export interface ModuleContext {
  run: string;
  /** this cell's node id */
  node: string;
  manifest: ModuleManifest;
  /** this cell's artifact folder (absolute); its files are served as artifacts/<node>/<name> */
  dir: string;
  /** merged config (apps/bridge config loader) */
  config: Record<string, any>;
  signal: AbortSignal;
  /** true when HARNESS_MOCK=1 */
  mock: boolean;
  step(title: string, detail?: string, icon?: string): void;
  /** "waiting" while the cell waits on the author (a script for approval); "running" when it carries on */
  state(state: "waiting" | "running"): void;
  /** copies `file` into the run when it lives elsewhere; returns its uri */
  evidence(kind: EvidenceKind, file: string, caption?: string, meta?: Record<string, unknown>): Promise<string>;
  output(name: string, file: string, kind: string, href?: string): Promise<string>;
  /** asset handoff: emits node.request / node.deliver around a run of `moduleId` */
  request(moduleId: string, input: ModuleInput): Promise<ModuleOutput>;
  /**
   * sends work back to another cell of this run that has finished (the verifier's fix): node.request to that
   * cell (`input.prompt` is what is wrong), which runs its own module again in place with the input it first got
   * plus `params.fix` = `input.prompt`, then node.deliver back; throws when it fails
   */
  ask(node: string, input: ModuleInput): Promise<ModuleOutput>;
  /** a step on another cell of this run (the verifier's check mark on the cell it checked) */
  mark(node: string, title: string, detail?: string, icon?: string): void;
  /** a child cell under this node running `moduleId` */
  spawn(moduleId: string, input: ModuleInput, opts?: { label?: string }): Promise<ModuleOutput>;
  sh(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }): Promise<ShResult>;
  /** headless CLI worker; its tool calls stream into this cell as steps */
  agent(prompt: string, opts?: AgentOptions): Promise<AgentResult>;
}

export type ModuleRun = (ctx: ModuleContext, input: ModuleInput) => Promise<ModuleOutput>;
