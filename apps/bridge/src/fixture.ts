// pnpm fixture <runId> <nodeId> <module> [name]: turns one cell of a real run (and everything under it)
// into a mock fixture, modules/<module>/fixtures/<name>.jsonl, replayed when HARNESS_MOCK=1.
// Ids become relative ("." is the cell), t becomes ms since the cell spawned, and every file the events
// reference is copied to fixtures/<name>/ and referenced as "./<name>/<file>".

import { parseJsonl, type HarnessEvent } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { abs, config, repoRoot } from "./config.ts";

export function extractFixture(events: HarnessEvent[], node: string, name: string): { lines: Record<string, unknown>[]; files: Map<string, string> } {
  const sub = new Set([node]);
  for (const e of events) if (e.type === "node.spawn" && e.parent && sub.has(e.parent)) sub.add(e.node);
  const spawn = events.find((e) => e.type === "node.spawn" && e.node === node);
  if (!spawn) throw new Error(`no cell ${node}`);
  const rel = (id: string) => (id === node ? "." : id.startsWith(node + ".") ? id.slice(node.length + 1) : id);
  const files = new Map<string, string>();
  const lines: Record<string, unknown>[] = [];
  for (const e of events) {
    if (!sub.has(e.node) || e.seq <= spawn.seq) continue;
    const { seq: _s, run: _r, ...x } = e as HarnessEvent & Record<string, unknown>;
    const l: Record<string, unknown> = { ...x, t: e.t - spawn.t, node: rel(e.node) };
    if (typeof l.parent === "string") l.parent = rel(l.parent);
    if (typeof l.to === "string" && sub.has(l.to)) l.to = rel(l.to);
    for (const k of ["uri", "thumb"]) {
      const u = l[k];
      if (typeof u === "string" && !u.includes("://") && !u.startsWith("/")) {
        const file = `${rel(e.node) === "." ? "" : rel(e.node) + "-"}${basename(u)}`;
        files.set(u, file);
        l[k] = `./${name}/${file}`;
      }
    }
    lines.push(l);
  }
  return { lines, files };
}

if (process.argv[1] && /fixture\.ts$/.test(process.argv[1])) {
  const [runId, node, mod, name = "default"] = process.argv.slice(2);
  if (!runId || !node || !mod) {
    console.error("usage: pnpm fixture <runId> <nodeId> <module> [name]");
    process.exit(2);
  }
  const runDir = join(abs(config().bridge.runsDir), runId);
  const events = parseJsonl(readFileSync(join(runDir, "events.jsonl"), "utf8"));
  const { lines, files } = extractFixture(events, node, name);
  const out = join(repoRoot, "modules", mod, "fixtures");
  mkdirSync(join(out, name), { recursive: true });
  for (const [u, f] of files) if (existsSync(join(runDir, u))) copyFileSync(join(runDir, u), join(out, name, f));
  writeFileSync(join(out, `${name}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`modules/${mod}/fixtures/${name}.jsonl: ${lines.length} events, ${files.size} files (from ${runId} ${node})`);
}
