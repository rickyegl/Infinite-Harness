// The stage. Two drivers share every view:
//   director (?director=1&shot=S11 or &from=S09&to=S20): t only moves through window.__harness.seek
//   live     (default, ?fixture=main&start=<ms>): t follows the wall clock; click a cell to focus, Escape returns
// Every frame is f(events, t, view): the events are reduced at t and the views draw that state.

import { emptyState, findNode, reduce } from "@harness/protocol";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { CameraRig, resolveTarget, type Cam } from "./camera.ts";
import { Clock, useClock } from "./clock.ts";
import type { Ctx } from "./ctx.ts";
import { artifactUrl, loadRange, loadTake, loadTimeline, preloadTake, type ShotData, type Take, type Timeline } from "./data.ts";
import { makeTimebase, type Direction, type ViewName } from "./direction.ts";
import { fxAt } from "./fx.tsx";
import { computeLayout } from "./layout.ts";
import { color, font, size } from "./theme.ts";
import { BannerView, FocusView, GraphView, PromptView, RainView, SplitView, TitleView, WallView } from "./views.tsx";

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

export function App() {
  return <Scaler>{DIRECTOR ? <Director /> : <Live />}</Scaler>;
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

function Draw({ ctx }: { ctx: Ctx }) {
  switch (ctx.dir.view) {
    case "prompt": return <PromptView ctx={ctx} />;
    case "graph": return <GraphView ctx={ctx} />;
    case "focus": return <FocusView ctx={ctx} />;
    case "split": return <SplitView ctx={ctx} />;
    case "wall": return <WallView ctx={ctx} />;
    case "banner": return <BannerView ctx={ctx} />;
    case "rain": return <RainView ctx={ctx} />;
    case "title": return <TitleView ctx={ctx} />;
  }
}

function Frame({ ctx, fx }: { ctx: Ctx; fx?: Direction["fx"] }) {
  const f = fxAt(fx, ctx.tb.tau, ctx.tb.beatMs);
  return (
    <div data-view={ctx.dir.view} data-shot={ctx.shot?.id ?? ""} style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", inset: 0, ...f.stage }}>
        <Draw ctx={ctx} />
      </div>
      {f.overlay ? <div style={{ position: "absolute", inset: 0, background: f.overlay.color, opacity: f.overlay.opacity, pointerEvents: "none" }} /> : null}
    </div>
  );
}

const Message = ({ text }: { text: string }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: color.dim, font: `500 24px ${font.mono}` }}>{text}</div>
);

// ------------------------------------------------------------------ director

type Loaded = { tl: Timeline; shots: ShotData[]; rigs: (CameraRig | null)[]; duration: number };

function Director() {
  const clock = useMemo(() => new Clock("director", Number(q.get("t") ?? 0)), []);
  const t = useClock(clock);
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const tl = await loadTimeline();
      const from = q.get("shot") ?? q.get("from") ?? tl.shots[0].id;
      const to = q.get("shot") ?? q.get("to") ?? from;
      const shots = await loadRange(tl, from, to);
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

/** waits until what was just rendered is fully on screen: fonts, every image decoded, two paints */
async function settle(): Promise<void> {
  await document.fonts.ready;
  const imgs = [...document.querySelectorAll<HTMLImageElement>("#stage img")];
  await Promise.all(imgs.map((im) => (im.complete ? im.decode().catch(() => {}) : new Promise<void>((r) => { im.onload = im.onerror = () => r(); }))));
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

// ------------------------------------------------------------------ live

type LiveView = { view: ViewName; focus: string | null; since: number };

function Live() {
  const start = Number(q.get("start") ?? 0);
  const clock = useMemo(() => new Clock("live", start), [start]);
  const t = useClock(clock);
  const [take, setTake] = useState<Take | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lv, setLv] = useState<LiveView>({ view: "graph", focus: null, since: 0 });
  const rig = useRef<CameraRig | null>(null);
  const tRef = useRef(0);
  tRef.current = t;

  useEffect(() => {
    (async () => {
      const id = q.get("fixture") ?? q.get("take") ?? "main";
      const [tk, timeline] = await Promise.all([loadTake(id), loadTimeline().catch(() => null)]);
      if (!tk) throw new Error(`no take or fixture named ${id}`);
      await preloadTake(tk);
      rig.current = new CameraRig(resolveTarget("all", tk.layout, tk.final));
      setTl(timeline);
      setTake(tk);
    })().catch((e) => setErr(String(e?.message ?? e)));
    return () => clock.stop();
  }, [clock]);

  // layout follows the graph as it grows; recomputed only when a node appears
  const state = take ? reduce(take.events, t) : emptyState(t);
  const layout = useMemo(() => (take ? (state.order.length === take.final.order.length ? take.layout : computeLayout(state)) : null), [take, state.order.length]); // eslint-disable-line

  const focusOn = (id: string) => {
    if (!take || !rig.current || !layout) return;
    rig.current.moveTo(resolveTarget(id, layout, state), tRef.current);
    setLv({ view: "focus", focus: id, since: tRef.current });
  };
  const back = () => {
    if (!take || !rig.current || !layout) return;
    rig.current.moveTo(resolveTarget("all", layout, state), tRef.current);
    setLv({ view: "graph", focus: null, since: tRef.current });
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") back();
    };
    addEventListener("keydown", on);
    window.__harness = {
      mode: "live", duration: Infinity, ready: !!take, shots: [],
      seek: async () => {},
      view: () => ({ view: lvRef.current.view, focus: lvRef.current.focus }),
    };
    return () => removeEventListener("keydown", on);
  });
  const lvRef = useRef(lv);
  lvRef.current = lv;

  if (err) return <Message text={err} />;
  if (!take || !layout) return null;
  const beatMs = 60000 / (tl?.grid.bpm ?? 128);
  const tb = makeTimebase(t, beatMs, null, "live");
  const cam: Cam = rig.current ? rig.current.seek(t) : { x: 0, y: 0, z: 1 };
  const liveTake: Take = { ...take, layout };
  const focusNode = lv.focus ? findNode(state, lv.focus) : undefined;
  const ctx: Ctx = {
    tb, state, take: liveTake, shot: null, timeline: tl, cam,
    dir: { shot: "live", draft: false, view: lv.view, params: { recDot: false } },
    url: (u) => artifactUrl(take.base, u),
    onCell: (id) => (lv.view === "focus" && lv.focus === id ? back() : focusOn(id)),
    focus: focusNode?.id ?? null,
    viewAge: t - lv.since,
  };
  // a click outside the focus panel (cells stop their own clicks) returns to the graph
  const outside = (e: MouseEvent) => {
    if (lv.view === "focus" && !(e.target as Element).closest("[data-focus]")) back();
  };
  return <div onClick={outside} style={{ position: "absolute", inset: 0 }}><Frame ctx={ctx} /></div>;
}
