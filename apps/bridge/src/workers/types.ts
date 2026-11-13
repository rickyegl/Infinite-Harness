import type { ModuleManifest } from "@harness/protocol";
import type { WorkerConfig } from "../config.ts";

/** What a worker may do, resolved from a module's `allow` block (modules.ts documents the vocabulary). */
export type Grants = {
  /** harness MCP tools the worker may call ("*" = all five) */
  harness: string[] | "*";
  /** other MCP servers from the CLI's own config: server -> tool names or "*" */
  servers: Record<string, string[] | "*">;
  shell: boolean;
  web: boolean;
  /** absolute folders the worker may write, besides its working folder */
  writeDirs: string[];
  network: string[];
};

/** The harness MCP server process the worker CLI starts for itself (stdio). */
export type McpLaunch = { command: string; args: string[]; env: Record<string, string> };

export type WorkerCall = {
  name: string;
  cfg: WorkerConfig;
  prompt: string;
  cwd: string;
  grants: Grants;
  manifest: Pick<ModuleManifest, "id" | "allow">;
  harnessMcp: McpLaunch | null;
  schema?: Record<string, unknown>;
  timeoutMs: number;
  signal: AbortSignal;
  onStep: (title: string, detail?: string, icon?: string) => void;
  onFile: (absPath: string) => void;
  /** raw event lines, for the worker log in the run folder */
  onRaw?: (line: string) => void;
};

export type WorkerOutcome = { ok: boolean; text: string; json?: unknown; files: string[]; error?: string };

export const HARNESS_TOOLS = ["report_step", "attach_evidence", "spawn_task", "request_asset", "publish_output"] as const;
