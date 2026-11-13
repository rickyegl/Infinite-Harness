// The bridge end to end, offline: mock mode replays the recorded router output and the mock.agent fixture.
// The events that arrive over the WebSocket are exactly runs/<id>/events.jsonl, and a second subscription
// from seq 0 (a page reload) gets the same events again.

import { reduce, type HarnessEvent } from "@harness/protocol";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridge, type Bridge } from "../src/bridge.ts";
import { config, merge, type HarnessConfig } from "../src/config.ts";

let b: Bridge;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "harness-bridge-"));
  const cfg = merge<HarnessConfig>(config(), {
    bridge: { port: 0, runsDir: join(dir, "runs"), tokenFile: join(dir, "runs", ".bridge-token") },
    mock: { enabled: true, speed: 40 },
  });
  b = await createBridge(cfg);
});
afterAll(async () => {
  await b?.close();
  rmSync(dir, { recursive: true, force: true });
});

const auth = () => ({ authorization: `Bearer ${b.token}` });

/** every event of a run from seq, until run.done (or the socket stays quiet for 5 s after it) */
function collect(id: string, seq = 0): Promise<HarnessEvent[]> {
  return new Promise((resolve, reject) => {
    const got: HarnessEvent[] = [];
    const ws = new WebSocket(`${b.url.replace("http", "ws")}/runs/${id}/events?seq=${seq}`, { headers: auth() });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timed out after ${got.length} events`));
    }, 60000);
    ws.on("message", (d) => {
      const e = JSON.parse(String(d)) as HarnessEvent;
      got.push(e);
      if (e.type === "run.done") {
        clearTimeout(timer);
        ws.close();
        resolve(got);
      }
    });
    ws.on("error", reject);
  });
}

describe("bridge server", () => {
  it("refuses every request without the pairing token", async () => {
    for (const p of ["/health", "/modules", "/runs"]) expect((await fetch(b.url + p)).status).toBe(401);
    expect((await fetch(`${b.url}/health?token=wrong`)).status).toBe(401);
    expect((await fetch(`${b.url}/health`, { headers: auth() })).status).toBe(200);
    expect((await fetch(`${b.url}/t/${b.token}/health`)).status).toBe(200);
    const refused = await new Promise<boolean>((res) => {
      const ws = new WebSocket(`${b.url.replace("http", "ws")}/runs/x/events?seq=0`);
      ws.on("open", () => res(false));
      ws.on("error", () => res(true));
    });
    expect(refused).toBe(true);
  });

  it("lists the installed modules", async () => {
    const mods = (await (await fetch(`${b.url}/modules`, { headers: auth() })).json()) as { id: string }[];
    expect(mods.map((m) => m.id)).toEqual(expect.arrayContaining(["mock.agent", "mock.echo", "mock.asset"]));
  });

  it("runs a prompt; the socket carries exactly the stored events; a reload replays them", { timeout: 90000 }, async () => {
    const r = await fetch(`${b.url}/runs`, { method: "POST", headers: { ...auth(), "content-type": "application/json" }, body: JSON.stringify({ prompt: "say hello three ways" }) });
    expect(r.status).toBe(200);
    const { id } = (await r.json()) as { id: string };

    const live = await collect(id);
    const stored = b.store.events(id);
    expect(live).toEqual(stored);
    expect(live.map((e) => e.seq)).toEqual(stored.map((_, i) => i + 1));

    const s = reduce(live);
    expect(s.root).toBe("root");
    expect(s.nodes.root.kind).toBe("root");
    const cell = Object.values(s.nodes).find((n) => n.module === "mock.agent")!;
    expect(cell.state).toBe("done");
    const kids = Object.values(s.nodes).filter((n) => n.parent === cell.id);
    expect(kids).toHaveLength(3);
    for (const k of kids) {
      expect(k.state).toBe("done");
      expect(k.evidence).toHaveLength(1);
    }
    expect(s.nodes.root.state).toBe("done");

    // reload: same events from seq 0; a resume from seq 10 gets only what came after
    expect(await collect(id)).toEqual(stored);
    expect((await collect(id, 10)).map((e) => e.seq)).toEqual(stored.filter((e) => e.seq > 10).map((e) => e.seq));
    const text = await (await fetch(`${b.url}/runs/${id}/events?seq=20`, { headers: auth() })).text();
    expect(text.trim().split("\n").map((l) => JSON.parse(l).seq)).toEqual(stored.filter((e) => e.seq > 20).map((e) => e.seq));

    // artifacts: served with the token in the path, dotfiles and traversal refused
    const ev = live.find((e) => e.type === "node.evidence") as Extract<HarnessEvent, { type: "node.evidence" }>;
    const file = await fetch(`${b.url}/t/${b.token}/runs/${id}/${ev.uri}`);
    expect(file.status).toBe(200);
    expect((await file.text()).length).toBeGreaterThan(0);
    expect((await fetch(`${b.url}/runs/${id}/.secret`, { headers: auth() })).status).toBe(403);
    expect((await fetch(`${b.url}/runs/${id}/..%2F.bridge-token`, { headers: auth() })).status).toBeGreaterThanOrEqual(400);
  });
});
