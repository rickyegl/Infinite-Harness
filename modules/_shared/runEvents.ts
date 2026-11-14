// A cell reading its own run as it happens: the bridge writes runs/<id>/events.jsonl event by event, so a cell
// that comes after the others (the Verifier, the Recorder) reduces that file to see what they made and waits
// until they are finished.

import type { GraphState, HarnessEvent, ModuleContext, NodeView } from "@harness/protocol";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reduce } from "../../packages/protocol/src/reduce.ts";

export function runEvents(runDir: string): HarnessEvent[] {
  const f = join(runDir, "events.jsonl");
  if (!existsSync(f)) return [];
  const out: HarnessEvent[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // the line being written right now
    }
  }
  return out;
}

export const runState = (runDir: string): GraphState => reduce(runEvents(runDir));

export const busy = (n: NodeView) => n.state === "queued" || n.state === "running" || n.state === "waiting";

/** every cell but the root, the asset hub, `self` (and its children), and cells running one of `skip` */
export function others(g: GraphState, self: string, skip: ReadonlySet<string>): string[] {
  return g.order.filter((id) => {
    const n = g.nodes[id];
    if (!n || id === self || id === g.root || id === "assets" || id.startsWith(`${self}.`)) return false;
    return !skip.has(n.module);
  });
}

/** polls the run until none of `others` is queued, running or waiting; a step every minute says who it waits for */
export async function waitForOthers(ctx: ModuleContext, runDir: string, skip: ReadonlySet<string>, waitMs: number): Promise<GraphState> {
  const t0 = Date.now();
  let said = 0;
  for (;;) {
    const g = runState(runDir);
    const open = others(g, ctx.node, skip).filter((id) => busy(g.nodes[id]));
    if (!open.length) return g;
    if (ctx.signal.aborted) throw new Error("cancelled");
    if (Date.now() - t0 > waitMs) throw new Error(`still waiting for ${open.join(", ")} after ${Math.round(waitMs / 60000)} min`);
    if (Date.now() - said > 60_000) {
      ctx.step("Waiting for the other cells", open.map((id) => g.nodes[id].label).join(", "), "clock");
      said = Date.now();
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
