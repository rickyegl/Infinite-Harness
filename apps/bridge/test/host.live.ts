// pnpm test:host — the Host cell over the real network: a throwaway run with a small browser page in
// artifacts/webgl/ (a canvas that draws, standing in for a game build), a Host cell that tunnels it, and checks
// that the public address answers, that the page draws through it, and that the tunnel is gone once the bridge
// stops. Needs cloudflared (config paths.cloudflared) and a network; takes about a minute.

import { reduce, type HarnessEvent } from "@harness/protocol";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridge } from "../src/bridge.ts";
import { config, merge, type HarnessConfig } from "../src/config.ts";
import { alive, readProcs } from "../src/procs.ts";

const PAGE = `<!doctype html><meta charset="utf-8"><title>test build</title>
<style>html,body{margin:0;height:100%;background:#0b0d12}canvas{display:block;width:100%;height:100%}</style>
<canvas id="c"></canvas><script>
const c = document.getElementById("c"), g = c.getContext("2d");
function draw(t) {
  c.width = innerWidth; c.height = innerHeight;
  g.fillStyle = "#0b0d12"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = "hsl(" + (i * 30 + t / 20) % 360 + ",70%,55%)";
    g.fillRect(40 + i * 90, c.height / 2 - 60 + Math.sin(t / 300 + i) * 80, 70, 120);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
</script>`;

const fail = (m: string) => {
  console.error(`FAIL ${m}`);
  process.exitCode = 1;
};

const dir = mkdtempSync(join(tmpdir(), "harness-host-"));
const runsDir = join(dir, "runs");
const cfg = merge<HarnessConfig>(config(), { bridge: { port: 0, runsDir, tokenFile: join(runsDir, ".bridge-token") } });
const b = await createBridge(cfg);
let pid = 0;
try {
  const seed = b.runner.cell(null, "mock.echo", { prompt: "a run to host" });
  if (!(await seed.done)) throw new Error("the seed cell failed");
  const runDir = seed.run.log.dir;
  mkdirSync(join(runDir, "artifacts", "webgl"), { recursive: true });
  writeFileSync(join(runDir, "artifacts", "webgl", "index.html"), PAGE);

  const t0 = Date.now();
  const h = b.runner.cell(seed.run.id, "host", { prompt: "put it online" });
  const out = await h.done;
  const ev: HarnessEvent[] = readFileSync(join(runDir, "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const g = reduce(ev);
  for (const e of ev) if (e.node === "host" && e.type === "node.step") console.log(`  ${e.title} — ${e.detail ?? ""}`);
  if (!out) throw new Error(`host failed: ${g.nodes.host?.error ?? "?"}`);
  console.log(`host: ${out.summary} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  const link = g.outputs.find((o) => o.node === "host" && o.kind === "link");
  if (!link?.href?.startsWith("https://")) fail("no public link output");
  const shot = g.nodes.host.evidence.find((e) => e.kind === "link");
  if (!shot || (shot.meta as { blank?: boolean })?.blank) fail("the page did not draw through the public address");
  else if (!existsSync(join(runDir, String((shot.meta as { shot?: string }).shot)))) fail("screenshot missing");
  pid = readProcs(join(runsDir, ".procs.json")).find((p) => p.kind === "tunnel")?.pid ?? 0;
  if (!pid || !alive(pid)) fail("no live tunnel recorded");
} catch (e) {
  fail((e as Error).message);
} finally {
  await b.close();
}
await new Promise((r) => setTimeout(r, 1500));
if (pid && alive(pid)) fail(`tunnel ${pid} still running after the bridge stopped`);
else if (pid) console.log("tunnel closed with the bridge");
rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? "host: FAILED" : "host: ok");
