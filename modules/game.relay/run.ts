// "Add crossplay": opens a relay room on the bridge (/relay/<run id>) and points the games at it. Unity builds
// talk WebSocket; the Roblox place's server script posts over HTTP (through a tunnel when it runs outside this
// machine). Before switching it on, the cell checks the room both ways: a WebSocket client and an HTTP client
// each see the other's state. Then it plays the Unity game for a few seconds in the editor while a stand-in
// Roblox rider posts states, so the shot shows the other engine's player as a ghost kart.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { uriOf } from "../game.unity/lib/parts.ts";
import { live, seconds, setFlags } from "../game/lib/live.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function run(ctx: ModuleContext, _input: ModuleInput): Promise<ModuleOutput> {
  const t0 = Date.now();
  const l = live(ctx);
  const base = String(ctx.config.bridge?.url ?? `http://${ctx.config.bridge?.host ?? "127.0.0.1"}:${ctx.config.bridge?.port ?? 7411}`).replace(/\/$/, "");
  const room = ctx.run.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
  const httpUrl = `${base}/relay/${room}`;
  const wsUrl = httpUrl.replace(/^http/, "ws");
  ctx.step("Opening the relay room", httpUrl, "link");

  // 1. both ways: a WebSocket sender and an HTTP sender must each receive the other's state (in a side room,
  //    so the probes never show up as riders in the game)
  const checkUrl = `${httpUrl}-check`;
  const ws = new WebSocket(checkUrl.replace(/^http/, "ws"));
  const got: string[] = [];
  ws.onmessage = (e) => got.push(String(e.data));
  await new Promise<void>((ok, fail) => {
    ws.onopen = () => ok();
    ws.onerror = () => fail(new Error(`could not open the relay at ${checkUrl}`));
    setTimeout(() => fail(new Error(`no answer from the relay at ${checkUrl}`)), 4000);
  });
  ws.send(JSON.stringify({ id: "probe-unity", eng: "unity", name: "probe", p: 0 }));
  await wait(150);
  const post = async (state: object, url = httpUrl) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
    if (!r.ok) throw new Error(`relay POST ${r.status}`);
    return (await r.json()) as { seq: number; states: { id: string }[] };
  };
  const back = await post({ id: "probe-roblox", eng: "roblox", name: "probe", p: 0 }, checkUrl);
  for (let i = 0; i < 20 && !got.some((g) => g.includes("probe-roblox")); i++) await wait(50);
  ws.close();
  const wsSawHttp = got.some((g) => g.includes("probe-roblox"));
  const httpSawWs = back.states.some((s) => s.id === "probe-unity");
  ctx.step(wsSawHttp && httpSawWs ? "Relay works both ways" : "Relay check failed", `WebSocket received the HTTP state: ${wsSawHttp ? "yes" : "no"}; HTTP received the WebSocket state: ${httpSawWs ? "yes" : "no"}`, wsSawHttp && httpSawWs ? "check" : "alert");
  if (!wsSawHttp || !httpSawWs) throw new Error("the relay room did not pass states both ways");

  // 2. switch the games over (project, running build, Roblox place config)
  setFlags(l, { relay: true, relayUrl: wsUrl }, ctx);
  const doc = join(ctx.dir, "relay.md");
  writeFileSync(
    doc,
    [
      "# Crossplay relay",
      "",
      `Room \`${room}\` on the bridge.`,
      "",
      `- Unity builds connect over WebSocket: \`${wsUrl}\``,
      `- The Roblox place's server posts its riders' states over HTTP: \`POST ${httpUrl}\` and gets everyone else's back.`,
      "- A state is `{id, eng, name, c, p, l, h, v, lap}`: track progress 0..1, lateral -1..1, heading, speed, lap.",
      "- Other players show up as translucent ghost karts with a name tag. Nothing collides across engines.",
      "",
      "Checked both ways before switching on: the WebSocket client received the HTTP sender's state, and the HTTP sender got the WebSocket client's state back.",
      "",
      "Roblox servers cannot reach 127.0.0.1: point the place at a public tunnel to the bridge for real crossplay.",
      "",
    ].join("\n"),
  );
  await ctx.evidence("doc", doc, "Relay");
  await ctx.output("Crossplay room", doc, "link", httpUrl);

  // 3. a few seconds of the Unity game with a stand-in Roblox rider in the room
  if (l.u) {
    await l.u.ensureEditor();
    ctx.step("Racing a stand-in Roblox rider", "the editor plays the game while this cell posts a rider's states to the room", "play");
    // the karts wait on the grid during the countdown: park the stand-in a few metres behind the line, in the
    // other lane, so it sits in the shot next to the player
    const metres = l.state.unity?.metres ?? 1000;
    const p = 1 - 5 / metres;
    let stop = false;
    const feeder = (async () => {
      while (!stop) {
        await post({ id: "roblox-standin", eng: "roblox", name: "Roblox rider", c: "#3FA9F5", p, l: -0.5, h: 0, v: 0, lap: 0 }).catch(() => {});
        await wait(100);
      }
    })();
    try {
      await shotsInPlay(ctx, l);
    } finally {
      stop = true;
      await feeder;
    }
  }
  return { summary: `Crossplay on in ${seconds(t0)}: room ${room}, checked both ways` };
}

/** plays the game for two seconds in the editor and keeps the last frame as evidence */
async function shotsInPlay(ctx: ModuleContext, l: ReturnType<typeof live>) {
  const dir = join(ctx.dir, "play");
  await l.u!.op("play_capture", { outDir: dir, seconds: 2, fps: 2, width: 1280, height: 720, warmup: 2, from: "" }, 2 * 60_000);
  const frames = readdirSync(dir).filter((f) => /^frame_\d+\.jpg$/.test(f)).sort();
  if (!frames.length) return;
  const keep = frames.slice(-2).map((f) => join(dir, f));
  await ctx.evidence("frames", keep[0], "Ghost from the other engine", { frames: keep.map((f) => uriOf(ctx, f)), fps: 1, loop: true, fit: "cover" });
}
