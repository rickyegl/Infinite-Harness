// pnpm --filter bridge smoke ["prompt"]: starts a bridge on a free port, posts the prompt through HTTP, follows
// the run over the WebSocket and prints one line per event. Exits 0 when the run ends done.
// Use the bridge that is already running instead with HARNESS_BRIDGE=<url> (token read from the token file).

import type { HarnessEvent } from "@harness/protocol";
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createBridge } from "./bridge.ts";
import { abs, config } from "./config.ts";

const prompt = process.argv[2] ?? "say hello three ways";
const cfg = config();
let url = process.env.HARNESS_BRIDGE;
let token: string;
let close = async () => {};
if (url) token = readFileSync(abs(cfg.bridge.tokenFile), "utf8").trim();
else {
  const b = await createBridge({ ...cfg, bridge: { ...cfg.bridge, port: 0 } });
  url = b.url;
  token = b.token;
  close = b.close;
}
const h = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const r = (await (await fetch(`${url}/runs`, { method: "POST", headers: h, body: JSON.stringify({ prompt }) })).json()) as { id: string };
console.log(`run ${r.id}: ${prompt}`);
const ws = new WebSocket(`${url.replace("http", "ws")}/runs/${r.id}/events?seq=0`, { headers: { authorization: `Bearer ${token}` } });
const ok = await new Promise<boolean>((resolve) => {
  let failed = false;
  ws.on("message", (d) => {
    const e = JSON.parse(String(d)) as HarnessEvent;
    const x = e as unknown as Record<string, unknown>;
    const what = x.title ?? x.label ?? x.state ?? x.summary ?? x.message ?? x.uri ?? x.what ?? "";
    console.log(`${String(e.seq).padStart(4)} ${String((e.t / 1000).toFixed(1)).padStart(6)}s ${e.node.padEnd(22)} ${e.type.padEnd(13)} ${String(what).slice(0, 90)}`);
    if (e.type === "node.error") failed = true;
    if (e.type === "run.done") resolve(!failed);
  });
  ws.on("error", (err) => {
    console.error(err.message);
    resolve(false);
  });
});
ws.close();
await close();
console.log(ok ? `done: ${r.id}` : `failed: ${r.id}`);
process.exit(ok ? 0 : 1);
