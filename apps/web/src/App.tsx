// The stage. Two drivers share every view:
//   director (?director=1&shot=S11 or &from=S09&to=S20, or &take=<id> for a whole take on the graph view, or
//            &run=<id>[&src=<bridge>&token=<t>&dur=24] for a run told in 20-30 s by the automatic cut, the recorder):
//            t only moves through window.__harness.seek
//   live     (?fixture=main&start=<ms> or ?take=<id>: a recorded take; otherwise the bridge, see live.tsx):
//            t follows the wall clock; click a cell to focus, Escape returns
// Every frame is f(events, t, view): the events are reduced at t and the views draw that state.

import { emptyState, parseJsonl, reduce } from "@harness/protocol";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { CameraRig } from "./camera.ts";
import { Clock, useClock } from "./clock.ts";
import type { Ctx } from "./ctx.ts";
import { autoShots } from "./autocut.ts";
import { artifactUrl, loadRange, loadTake, loadTimeline, makeTake, preloadTake, type Shot, type ShotData, type Take, type Timeline } from "./data.ts";
import { makeTimebase, type Direction, type ViewName } from "./direction.ts";
import { Frame, Message } from "./frame.tsx";
import { BridgeLive, FixtureLive } from "./live.tsx";
import { artifactBase, loadSettings, takePairing } from "./bridge.ts";
import { color, size } from "./theme.ts";

declare global {
  interface Window {
    __harness?: {
      /** director: draw the frame at ms (range-relative); resolves once fonts, images and paint are settled */
      seek: (ms: number) => Promise<void>;
      /** ms */
      duration: number;
      ready: boolean;
      mode: "live" | "director";
      /** range-relative start and length of every shot, ms */
      shots: { id: string; at: number; durMs: number; view: ViewName }[];
      /** live: current view and focused node */
      view?: () => { view: ViewName; focus: string | null };
    };
  }
}

const q = new URLSearchParams(location.search);
const DIRECTOR = q.get("director") === "1";
takePairing();

export function App() {
  const live = q.has("fixture") || q.has("take") ? <FixtureLive /> : <BridgeLive />;
  return <Scaler>{DIRECTOR ? <Director /> : live}</Scaler>;
}

/** lays the stage out at 1920x1080 and scales it to the window */
function Scaler({ children }: { children: ReactNode }) {
  const [s, setS] = useState(() => Math.min(innerWidth / size.stageW, innerHeight / size.stageH));
  useEffect(() => {
    const on = () => setS(Math.min(innerWidth / size.stageW, innerHeight / size.stageH));
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: color.black, overflow: "hidden" }}>
      <div id="stage" style={{ position: "absolute", left: (innerWidth - size.stageW * s) / 2, top: (innerHeight - size.stageH * s) / 2,
        width: size.stageW, height: size.stageH, transform: `scale(${s})`, transformOrigin: "0 0", overflow: "hidden", background: color.bg }}>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ director

type Loaded = { tl: Timeline; shots: ShotData[]; rigs: (CameraRig | null)[]; duration: number };

function Director() {
  const clock = useMemo(() => new Clock("director", Number(q.get("t") ?? 0)), []);
  const t = useClock(clock);
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const runId = q.get("run");
      const takeOnly = q.get("take") && !q.get("shot") && !q.get("from");
      const tl = takeOnly || runId ? await loadTimeline().catch(() => NO_TIMELINE) : await loadTimeline();
      let shots: ShotData[];
      if (runId) shots = autoShots(await runTake(runId), 60000 / tl.grid.bpm, Number(q.get("dur") ?? 24));
      else if (takeOnly) shots = [await wholeTake(q.get("take")!, 60000 / tl.grid.bpm)];
      else {
        const from = q.get("shot") ?? q.get("from") ?? tl.shots[0].id;
        const to = q.get("shot") ?? q.get("to") ?? from;
        shots = await loadRange(tl, from, to);
      }
      const takes = new Set<Take>();
      for (const s of shots) if (s.take) takes.add(s.take);
      await Promise.all([...takes].map(preloadTake));
      const beatMs = 60000 / tl.grid.bpm;
      const rigs = shots.map((s) =>
        s.take ? CameraRig.fromKeys(s.dir.camera?.length ? s.dir.camera : [{ beat: 0, target: "all", dur: 0 }], beatMs, s.take.layout, s.take.final) : null,
      );
      const duration = shots.reduce((m, s) => Math.max(m, s.at + s.durMs), 0);
      await document.fonts.ready;
      setData({ tl, shots, rigs, duration });
    })().catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!data) return;
    window.__harness = {
      mode: "director",
      duration: data.duration,
      ready: true,
      shots: data.shots.map((s) => ({ id: s.shot.id, at: s.at, durMs: s.durMs, view: s.dir.view })),
      seek: async (ms: number) => {
        flushSync(() => clock.set(ms));
        await settle();
      },
    };
    if (q.get("play") === "1") clock.play(Number(q.get("t") ?? 0), data.duration);
    return () => clock.stop();
  }, [data, clock]);

  if (err) return <Message text={err} />;
  if (!data) return null;

  // the shot that contains t: the last one starting at or before it
  let i = 0;
  for (let k = 0; k < data.shots.length; k++) if (data.shots[k].at <= t) i = k;
  const sd = data.shots[i];
  const beatMs = 60000 / data.tl.grid.bpm;
  const tau = Math.max(0, Math.min(t - sd.at, sd.durMs - 0.001));
  const tb = makeTimebase(tau, beatMs, sd.map, "director");
  const state = sd.take ? reduce(sd.take.events, tb.takeT) : emptyState(tb.takeT);
  const cam = data.rigs[i]?.seek(tau) ?? { x: 0, y: 0, z: 1 };
  const take = sd.take;
  const ctx: Ctx = {
    tb, state, take, dir: sd.dir, shot: sd.shot, timeline: data.tl, cam,
    url: (u) => artifactUrl(take?.base ?? "/", u),
    focus: sd.dir.focus ?? null,
    viewAge: tau,
  };
  return <Frame key={sd.shot.id} ctx={ctx} fx={sd.dir.fx} />;
}

const NO_TIMELINE: Timeline = { grid: { bpm: 128, beatsPerBar: 4 }, total: 0, shots: [], rain: [] };

/** a take with no shot around it: the graph view over the whole take, camera on every cell, a short hold at the end */
async function wholeTake(id: string, beatMs: number): Promise<ShotData> {
  const take = await loadTake(id);
  if (!take) throw new Error(`no take or fixture named ${id}`);
  const durMs = Math.round(take.end + 3000);
  const dur = durMs / 1000;
  const shot: Shot = {
    id: `take:${id}`, act: 0, bar: 0, beats: durMs / beatMs, view: "graph", source: "take", take: id, say: "", screen: "", camera: "", fx: "",
    startBeat: 0, start: 0, end: dur, dur,
  };
  const dir: Direction = { shot: shot.id, draft: false, view: "graph", take: id, camera: [{ beat: 0, target: "all", dur: 0 }] };
  return { shot, dir, take, map: null, at: 0, durMs };
}

/** a run straight from the bridge (?src, else the saved address; ?token, else the saved token) */
async function runTake(id: string): Promise<Take> {
  const saved = loadSettings();
  const s = { address: q.get("src") ?? saved.address, token: q.get("token") ?? saved.token };
  const base = artifactBase(s, id);
  const r = await fetch(base + "events.jsonl");
  if (!r.ok) throw new Error(`the bridge answered ${r.status} for run ${id}`);
  return makeTake(id, parseJsonl(await r.text()), base, false);
}

/** waits until what was just rendered is fully on screen: fonts, every image decoded, two paints */
async function settle(): Promise<void> {
  await document.fonts.ready;
  const imgs = [...document.querySelectorAll<HTMLImageElement>("#stage img")];
  await Promise.all(imgs.map((im) => (im.complete ? im.decode().catch(() => {}) : new Promise<void>((r) => { im.onload = im.onerror = () => r(); }))));
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}
