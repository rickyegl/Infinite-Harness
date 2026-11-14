// The author's go on a waiting script (see modules/_shared/gate.ts). Runs as a follow-up under the cell it
// approves, or under a campaign above two reels. It approves only the scripts waiting in its parent's subtree;
// when more than one waits there and the prompt does not say which (or "both" / "all"), it approves none and
// lists them, because each script gets its own go.

import type { HarnessEvent, ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { approve, waiting, type Wait } from "../_shared/gate.ts";
import { runDirOf, scriptPage } from "../_shared/studio.ts";

/** the run's event log (modules import only types from the protocol package, so it is read here) */
export function eventsOf(text: string): HarnessEvent[] {
  const out: HarnessEvent[] = [];
  for (const line of text.split(String.fromCharCode(10))) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as HarnessEvent);
    } catch {
      /* a half-written last line */
    }
  }
  return out;
}

/** the waits in `parent`'s subtree (the parent itself and every cell spawned under it) */
export function inSubtree(events: HarnessEvent[], parent: string | null, waits: Wait[]): Wait[] {
  if (!parent || parent === "root") return waits;
  const sub = new Set([parent]);
  for (const e of events) if (e.type === "node.spawn" && e.parent && sub.has(e.parent)) sub.add(e.node);
  return waits.filter((w) => sub.has(w.node));
}

/** which of several waits the prompt names: by words of the cell's label or id ("the explainer", "Roblox") */
export function pick(prompt: string, waits: Wait[]): Wait[] {
  if (waits.length <= 1 || /\b(both|all|every|each)\b/i.test(prompt)) return waits;
  const words: string[] = prompt.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const named = waits.filter((w) => {
    const own: string[] = `${w.label} ${w.node}`.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const skip: string[] = ["script", "reel"];
    return own.some((o) => o.length > 3 && !skip.includes(o) && words.includes(o));
  });
  return named.length ? named : waits;
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const runDir = runDirOf(ctx);
  const log = join(runDir, "events.jsonl");
  const events = existsSync(log) ? eventsOf(readFileSync(log, "utf8")) : [];
  const me = events.find((e) => e.type === "node.spawn" && e.node === ctx.node) as (HarnessEvent & { parent: string | null }) | undefined;
  const all = waiting(runDir);
  const mine = inSubtree(events, me?.parent ?? null, all);
  const chosen = pick(input.prompt, mine.length ? mine : all);
  if (!chosen.length) throw new Error("no script is waiting for a go in this run");
  if (chosen.length > 1) {
    const names = chosen.map((w) => w.label).join(", ");
    ctx.step("More than one script is waiting", `${names}. Say which one, or "both".`, "alert");
    return { summary: `Waiting: ${names}. Say which one to approve, or "both".` };
  }
  const files: ModuleOutput["files"] = [];
  for (const w of chosen) {
    const text = approve(runDir, w);
    ctx.step(`Approved the ${w.label.toLowerCase()} script`, text.replace(/^#.*$/gm, "").trim().slice(0, 140), "check");
    const page = await scriptPage(ctx, text.replace(/^#.*$/gm, "").trim(), join(ctx.dir, `${w.node.replace(/[^\w.-]/g, "_")}-approved.png`), `${w.label} script: approved`);
    const uri = await ctx.evidence("doc", page, `${w.label} script approved`);
    files.push({ name: "approved.png", uri, kind: "doc" });
  }
  return { summary: `Approved ${chosen.map((w) => w.label.toLowerCase()).join(" and ")} script${chosen.length > 1 ? "s" : ""}`, files };
}
