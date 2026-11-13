import { runExecJsonl } from "./exec-jsonl.ts";
import { runStreamJson } from "./stream-json.ts";
import type { WorkerCall, WorkerOutcome } from "./types.ts";

export type { Grants, McpLaunch, WorkerCall, WorkerOutcome } from "./types.ts";
export { resolveGrants } from "./allow.ts";

/** One headless worker call through the adapter its config names. */
export function runWorker(call: WorkerCall): Promise<WorkerOutcome> {
  switch (call.cfg.adapter) {
    case "exec-jsonl": return runExecJsonl(call);
    case "stream-json": return runStreamJson(call);
    default: return Promise.reject(new Error(`workers.${call.name}: unknown adapter ${String(call.cfg.adapter)}`));
  }
}
