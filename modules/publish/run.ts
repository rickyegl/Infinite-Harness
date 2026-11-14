// Publish, dry run only: where and when the run's reels would go out, using the studio's own schedulers through
// plan.py (sockets blocked, writers replaced, the reels added to the catalog in memory only). It never uploads,
// schedules or writes the studio's catalog or post lists; real publishing needs the author's approval and is
// done by the author with the studio's tools.
//
// The reels: every reel.json that a reel cell wrote in this run ({ generator, project, file, title }), or
// params.reels with the same shape.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { python, runDirOf, scriptPage, studioRoot, why } from "../_shared/studio.ts";

export type Reel = { generator: string; project: string; file: string; title: string };
export type Entry = { platform: string; account: string; stem: string; post_at: string; status: string; note: string; caption: string };
export const MARKER = "DRY RUN";

/** the reel.json files cells wrote anywhere in the run, oldest first */
export function reelsIn(runDir: string): Reel[] {
  const found: { at: number; reel: Reel }[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4 || !existsSync(d)) return;
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory() && f.name !== "work" && f.name !== "approvals") walk(p, depth + 1);
      else if (f.name === "reel.json") {
        try {
          found.push({ at: statSync(p).mtimeMs, reel: JSON.parse(readFileSync(p, "utf8")) as Reel });
        } catch {
          /* not one of ours */
        }
      }
    }
  };
  walk(runDir, 0);
  return found.sort((a, b) => a.at - b.at).map((x) => x.reel);
}

/** the plan as page lines, one per post */
export function tableLines(entries: Entry[]): string[] {
  return entries.map((e) => {
    const when = e.post_at ? e.post_at.replace("T", " ").slice(0, 16) : "no date";
    return `${e.platform} ${e.account}: ${e.stem}, ${when}, ${e.status}${e.note ? ` (${e.note})` : ""}`;
  });
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const given = input.params?.reels;
  const reels = Array.isArray(given) ? (given as Reel[]) : reelsIn(runDirOf(ctx));
  if (!reels.length) throw new Error("no reel in this run to plan: make a reel or a campaign first");
  const tools = join(studioRoot(ctx), "shared", "tools");
  const list = join(ctx.dir, "reels.json");
  writeFileSync(list, JSON.stringify(reels, null, 1));

  ctx.step("Planning the posts", `${reels.length} reel${reels.length > 1 ? "s" : ""}, dry run: network and writes blocked`, "megaphone");
  const r = await ctx.sh(python(ctx), [join(import.meta.dirname, "plan.py"), list], {
    cwd: tools,
    env: { PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
    timeoutMs: 60_000,
  });
  if (r.code !== 0) throw new Error(`the dry-run plan failed: ${why(r)}`);
  const plan = JSON.parse(r.stdout.trim().split(/\r?\n/).pop() ?? "{}") as { mode?: string; entries?: Entry[] };
  if (plan.mode !== MARKER || !Array.isArray(plan.entries)) throw new Error("the planner did not report a dry run");
  const entries = plan.entries;
  const file = join(ctx.dir, "plan.json");
  writeFileSync(file, JSON.stringify(plan, null, 1));

  const dated = entries.filter((e) => e.post_at);
  for (const e of dated.slice(0, 8)) ctx.step(`${e.platform} ${e.account}`, `${e.stem} at ${e.post_at.replace("T", " ").slice(0, 16)}`, "megaphone");
  const page = await scriptPage(ctx, tableLines(entries).join("\n"), join(ctx.dir, "plan.png"), "Publishing plan (dry run, nothing posted)");
  const uri = await ctx.evidence("doc", page, "Publishing plan, dry run", { mode: MARKER, posts: dated.length });
  const juri = await ctx.output("plan.json", file, "code");
  return {
    summary: `Dry run: ${dated.length} post${dated.length === 1 ? "" : "s"} planned, nothing posted`,
    files: [
      { name: "plan.png", uri, kind: "doc" },
      { name: "plan.json", uri: juri, kind: "code" },
    ],
  };
}
