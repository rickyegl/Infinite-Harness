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
  if (!x.allow || typeof x.allow !== "object") return "allow is required";
  return null;
}
