// The "stop for the author's go" gate after a reel's script (the studio's explainer and premise recipes both
// stop there). The cell shows the script as doc evidence, goes to "waiting" and polls for the go:
//
//   runs/<run>/approvals/<node>.wait   written here: { node, label, script, hash, at }
//   runs/<run>/approvals/<node>.go     written by the approve module: { hash } of script.txt as it read it
//
// The go is bound to the text: a go whose hash is not the script's current hash (the script was edited after
// the go, or the go is stale) is dropped and the cell keeps waiting. The author may edit script.txt in the
// studio project before saying go; the gate returns the text that was approved, and the caller voices exactly
// that. HARNESS_AUTO_APPROVE=1 (set only for take capture, with the author present) skips the wait. Nothing a
// module or worker passes in params can skip it.

import type { ModuleContext } from "@harness/protocol";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDirOf, scriptPage } from "./studio.ts";

export type Wait = { node: string; label: string; script: string; hash: string; at: string };

export const hashOf = (text: string): string => createHash("sha256").update(text.replace(/\r/g, "").trim()).digest("hex").slice(0, 16);
export const approvalsDir = (runDir: string): string => join(runDir, "approvals");
const fileOf = (runDir: string, node: string, ext: "wait" | "go") => join(approvalsDir(runDir), `${node}.${ext}`);

export function waiting(runDir: string): Wait[] {
  const dir = approvalsDir(runDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".wait"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf8")) as Wait;
      } catch {
        return null;
      }
    })
    .filter((w): w is Wait => !!w);
}

/** the approve side: records a go for exactly the script text as it is now */
export function approve(runDir: string, w: Wait): string {
  const text = readFileSync(w.script, "utf8");
  writeFileSync(fileOf(runDir, w.node, "go"), JSON.stringify({ hash: hashOf(text), script: w.script, at: new Date().toISOString() }));
  return text;
}

/**
 * runs/<run>/approvals/approved.json: every go a cell took, as { script, hash, at }. A go is used up when a cell
 * reads it, so this list is what keeps an approval good for the same script text when a later step (the voice)
 * fails and the reel is asked for again. An edit changes the hash and needs a new go.
 */
const ledgerOf = (runDir: string) => join(approvalsDir(runDir), "approved.json");
type Approved = { script: string; hash: string; at: string };
function ledger(runDir: string): Approved[] {
  try {
    const l = JSON.parse(readFileSync(ledgerOf(runDir), "utf8"));
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}
export const approvedBefore = (runDir: string, script: string, hash: string): boolean => ledger(runDir).some((a) => a.script === script && a.hash === hash);
export function remember(runDir: string, script: string, hash: string): void {
  if (approvedBefore(runDir, script, hash)) return;
  mkdirSync(approvalsDir(runDir), { recursive: true });
  writeFileSync(ledgerOf(runDir), JSON.stringify([...ledger(runDir), { script, hash, at: new Date().toISOString() }], null, 1));
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const stop = () => (clearTimeout(t), rej(new Error("stopped")));
    const t = setTimeout(() => (signal.removeEventListener("abort", stop), res()), ms);
    signal.addEventListener("abort", stop, { once: true });
  });

/**
 * Shows the script and waits for the author's go. `script` is the script file (in the studio project, so the
 * author can edit it there). Returns the approved text.
 */
export async function gate(ctx: ModuleContext, label: string, script: string): Promise<string> {
  const runDir = runDirOf(ctx);
  const page = await scriptPage(ctx, readFileSync(script, "utf8").replace(/^#.*$/gm, "").trim(), join(ctx.dir, "script.png"), `${label} script`);
  await ctx.evidence("doc", page, `${label} script`, { script });
  if (process.env.HARNESS_AUTO_APPROVE === "1") {
    ctx.step("Script approved for the take", "HARNESS_AUTO_APPROVE is set", "check");
    return readFileSync(script, "utf8");
  }
  mkdirSync(approvalsDir(runDir), { recursive: true });
  // a go given to an earlier cell for this same script and text (the bridge stopped while it waited, the author
  // asked for the reel again, or a later step such as the voice failed) still counts; that cell's stale wait goes
  const now = hashOf(readFileSync(script, "utf8"));
  let earlier = approvedBefore(runDir, script, now);
  for (const f of readdirSync(approvalsDir(runDir))) {
    const at = join(approvalsDir(runDir), f);
    let rec: { script?: string; hash?: string } = {};
    try {
      rec = JSON.parse(readFileSync(at, "utf8"));
    } catch {
      continue;
    }
    if (rec.script !== script || f === `${ctx.node}.wait` || !/\.(wait|go)$/.test(f)) continue;
    if (f.endsWith(".go") && rec.hash === now) earlier = true;
    rmSync(at, { force: true });
  }
  if (earlier) {
    remember(runDir, script, now);
    ctx.step("Script approved earlier", "the author already said go on this exact text", "check");
    return readFileSync(script, "utf8");
  }
  rmSync(fileOf(runDir, ctx.node, "go"), { force: true });
  const wait: Wait = { node: ctx.node, label, script, hash: hashOf(readFileSync(script, "utf8")), at: new Date().toISOString() };
  writeFileSync(fileOf(runDir, ctx.node, "wait"), JSON.stringify(wait, null, 2));
  ctx.step("Waiting for your go", `Say "go" to voice this script, or edit ${script} first. No voice credits are used until then.`, "alert");
  ctx.state("waiting");
  try {
    for (;;) {
      await sleep(1000, ctx.signal);
      const go = fileOf(runDir, ctx.node, "go");
      if (!existsSync(go)) continue;
      let hash = "";
      try {
        hash = JSON.parse(readFileSync(go, "utf8")).hash;
      } catch {
        /* half-written; read it again next time */
        continue;
      }
      rmSync(go, { force: true });
      const text = readFileSync(script, "utf8");
      if (hash === hashOf(text)) {
        remember(runDir, script, hash);
        ctx.step("Script approved", text.replace(/^#.*$/gm, "").trim().slice(0, 140), "check");
        return text;
      }
      ctx.step("The script changed after the go", "Say go again to approve the new text", "alert");
    }
  } finally {
    rmSync(fileOf(runDir, ctx.node, "wait"), { force: true });
    ctx.state("running");
  }
}
