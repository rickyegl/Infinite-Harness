// pnpm stop: closes what the harness started and left running — its quick tunnels and the editors it opened —
// by the pids recorded in runs/.procs.json (never by program name: the author runs the same programs for their
// own work), then reminds about a Colab GPU runtime that is still up. A running bridge closes its own tunnels
// when it stops; this is for everything a crashed or killed bridge left behind.

import { abs, config } from "../apps/bridge/src/config.ts";
import { alive, killTree, procsFile, readProcs } from "../apps/bridge/src/procs.ts";
import { writeFileSync } from "node:fs";
import { forgeStatus } from "../modules/_shared/colab.ts";

const cfg = config();
const file = procsFile(abs(cfg.bridge.runsDir));
const list = readProcs(file);

let closed = 0;
for (const p of list) {
  if (!alive(p.pid)) {
    console.log(`already gone: ${p.what} (pid ${p.pid})`);
    continue;
  }
  killTree(p.pid);
  closed++;
  console.log(`closed: ${p.what} (pid ${p.pid})`);
}
writeFileSync(file, JSON.stringify(list.filter((p) => alive(p.pid)), null, 2) + "\n");
const left = list.filter((p) => alive(p.pid));
console.log(closed || list.length ? `${closed} closed${left.length ? `, ${left.length} still running` : ""}` : "nothing the harness started is running");
if (left.length) process.exitCode = 1;

const forge = await forgeStatus(cfg as unknown as Record<string, any>).catch(() => "no" as const);
if (forge === "up") console.log("Reminder: the Colab GPU runtime (asset forge) is still running. Stop it when the GPU work is done.");
else if (forge === "maybe") console.log("Reminder: a Colab GPU runtime was started and not stopped; check it in Colab and stop it if it is still up.");
