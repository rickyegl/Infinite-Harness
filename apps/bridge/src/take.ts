// pnpm take <runId> <take>: copies a run's events and every artifact they reference to video/takes/<take>/.
// The site replays it offline: /?director=1&take=<take> (or /?take=<take> on the wall clock).

import { parseJsonl, type HarnessEvent } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { abs, config, repoRoot } from "./config.ts";

export function referenced(events: HarnessEvent[]): string[] {
  const out = new Set<string>();
  const add = (u: unknown) => {
    if (typeof u === "string" && u && !u.includes("://") && !u.startsWith("/")) out.add(u);
  };
  for (const e of events) {
    if (e.type === "node.evidence") {
      add(e.uri);
      add(e.thumb);
      const m = e.meta ?? {};
      for (const k of ["frames", "pages", "images"]) if (Array.isArray(m[k])) (m[k] as unknown[]).forEach(add);
      add(m.shot);
      add(m.before);
    } else if (e.type === "node.output" || e.type === "node.deliver") add(e.uri);
  }
  return [...out];
}

export function makeTake(runDir: string, takeDir: string): { events: number; files: number; missing: string[] } {
  const events = parseJsonl(readFileSync(join(runDir, "events.jsonl"), "utf8"));
  mkdirSync(takeDir, { recursive: true });
  writeFileSync(join(takeDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const missing: string[] = [];
  let files = 0;
  for (const u of referenced(events)) {
    const from = join(runDir, u);
    if (u.split("/").includes("..") || !existsSync(from)) {
      missing.push(u);
      continue;
    }
    mkdirSync(dirname(join(takeDir, u)), { recursive: true });
    copyFileSync(from, join(takeDir, u));
    files++;
  }
  return { events: events.length, files, missing };
}

if (process.argv[1] && /take\.ts$/.test(process.argv[1])) {
  const [runId, take] = process.argv.slice(2);
  if (!runId || !take || !/^[A-Za-z0-9_-]+$/.test(take)) {
    console.error("usage: pnpm take <runId> <take>");
    process.exit(2);
  }
  const runDir = join(abs(config().bridge.runsDir), runId);
  if (!existsSync(join(runDir, "events.jsonl"))) {
    console.error(`no run ${runId} in ${config().bridge.runsDir}`);
    process.exit(1);
  }
  const r = makeTake(runDir, join(repoRoot, "video", "takes", take));
  console.log(`video/takes/${take}: ${r.events} events, ${r.files} files${r.missing.length ? `, missing: ${r.missing.join(", ")}` : ""}`);
  console.log(`replay: /?director=1&take=${take}`);
}
