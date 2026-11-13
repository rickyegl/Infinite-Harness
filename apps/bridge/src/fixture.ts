// pnpm fixture <runId> <nodeId> <module> [name]: turns one cell of a real run (and everything under it)
// into a mock fixture, modules/<module>/fixtures/<name>.jsonl, replayed when HARNESS_MOCK=1.
// Ids become relative ("." is the cell), t becomes ms since the cell spawned, and every file the events
// reference is copied to fixtures/<name>/ and referenced as "./<name>/<file>". Executables are not copied (their
// output line stays, the link does not resolve in a replay), and a video over 1.5 MB is re-encoded smaller.

import { parseJsonl, type HarnessEvent } from "@harness/protocol";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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
    const local = (u: unknown): u is string => typeof u === "string" && !u.includes("://") && !u.startsWith("/") && !u.startsWith("./");
    const keep = (u: string) => {
      const file = files.get(u) ?? `${rel(e.node) === "." ? "" : rel(e.node) + "-"}${basename(u)}`;
      files.set(u, file);
      return `./${name}/${file}`;
    };
    for (const k of ["uri", "thumb"]) if (local(l[k])) l[k] = keep(l[k] as string);
    // evidence meta can name more run files: a frame list, a before picture
    if (l.meta && typeof l.meta === "object") {
      const m = { ...(l.meta as Record<string, unknown>) };
      if (Array.isArray(m.frames)) m.frames = m.frames.map((u) => (local(u) ? keep(u) : u));
      if (local(m.before)) m.before = keep(m.before);
      l.meta = m;
    }
    lines.push(l);
    // the cell's own end closes the fixture; follow-ups spawned under it later belong to their own modules
    if (e.node === node && (e.type === "node.done" || e.type === "node.error")) break;
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
  const ffmpeg = config().paths?.ffmpeg || "ffmpeg";
  for (const [u, f] of files) {
    const src = join(runDir, u), dest = join(out, name, f);
    if (!existsSync(src) || /\.(exe|dll|so|dylib)$/i.test(f)) continue;
    if (/\.mp4$/i.test(f) && statSync(src).size > 1_500_000) {
      const tmp = dest + ".tmp.mp4";
      const r = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", src, "-vf", "scale=960:-2", "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", tmp]);
      if (r.status === 0) { renameSync(tmp, dest); continue; }
      if (existsSync(tmp)) unlinkSync(tmp);
    }
    copyFileSync(src, dest);
  }
  writeFileSync(join(out, `${name}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`modules/${mod}/fixtures/${name}.jsonl: ${lines.length} events, ${files.size} files (from ${runId} ${node})`);
}
