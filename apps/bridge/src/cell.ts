// pnpm cell <runId|new> <module> [prompt]: runs one module as a new cell of a run, without the router, on a
// bridge started for the purpose (port from config, or HARNESS_PORT). For trying a module on a real run.

import { config } from "./config.ts";
import { createBridge } from "./bridge.ts";

const [runId, moduleId, ...rest] = process.argv.slice(2);
if (!runId || !moduleId) {
  console.error("usage: pnpm cell <runId|new> <module> [prompt]");
  process.exit(2);
}
const b = await createBridge(config());
const prompt = rest.join(" ") || moduleId;
const { run, done } = b.runner.cell(runId === "new" ? null : runId, moduleId, { prompt });
console.log(`run ${run.id}: ${moduleId} on ${b.url}`);
const off = run.log.subscribe((e) => {
  const x = e as unknown as Record<string, unknown>;
  const what = x.title ?? x.summary ?? x.message ?? x.state ?? x.uri ?? "";
  console.log(`${(e.t / 1000).toFixed(1).padStart(7)}  ${e.node.padEnd(14)} ${e.type.padEnd(14)} ${String(what).slice(0, 140)}${x.detail ? ` — ${String(x.detail).slice(0, 160)}` : ""}`);
});
const out = await done;
off();
console.log(out ? `done: ${out.summary}` : "failed");
if (process.env.HARNESS_KEEP === "1") {
  console.log("keeping the bridge (and its tunnels) up; Ctrl+C to stop");
  process.on("SIGINT", async () => (await b.close(), process.exit(0)));
} else {
  await b.close();
  process.exit(out ? 0 : 1);
}
