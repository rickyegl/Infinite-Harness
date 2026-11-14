// Live mode. Two sources feed the same stage:
//   fixture  (?fixture=<name> or ?take=<id>[&start=<ms>]): a recorded take, played on the wall clock
//   bridge   (default): a prompt box that starts a run on the bridge, then (?run=<id>) the run's graph,
//            rebuilt from seq 0 and followed live over the WebSocket
// Every frame is still f(events, t, view): t is the wall clock since the run started, the events are what
// the bridge has sent so far. A reload replays from seq 0 and draws the same picture.

import { emptyState, findNode, reduce, type HarnessEvent } from "@harness/protocol";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { api, artifactBase, follow, loadSettings, saveSettings, speech, type BridgeSettings, type ProxyStatus, type RunMeta } from "./bridge.ts";
import { CameraRig, resolveTarget, type Cam } from "./camera.ts";
import { Clock, useClock } from "./clock.ts";
import type { Ctx } from "./ctx.ts";
import { artifactUrl, checkMakers, loadTake, loadTimeline, makeTake, preloadTake, type Take, type Timeline } from "./data.ts";
import { makeTimebase, type ViewName } from "./direction.ts";
import { Frame, Message } from "./frame.tsx";
import { Icon } from "./icons.tsx";
import { computeLayout } from "./layout.ts";
import { color, font, size } from "./theme.ts";
import { PromptView } from "./views.tsx";

type LiveView = { view: ViewName; focus: string | null; since: number };

/**
 * The graph of a take at t, with click-to-focus and Escape to return. When a cell appears while the graph
 * view is up, the camera moves to fit every cell again.
 */
export function LiveStage({ take, t, tl, children }: { take: Take; t: number; tl: Timeline | null; children?: ReactNode }) {
  const [lv, setLv] = useState<LiveView>({ view: "graph", focus: null, since: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const lvRef = useRef(lv);
  lvRef.current = lv;

  // layout follows the graph as it grows; recomputed only when a node appears
  const state = reduce(take.events, t);
  const n = state.order.length;
  const layout = useMemo(() => (n === take.final.order.length ? take.layout : computeLayout(state)), [take, n]); // eslint-disable-line
  const rig = useRef<CameraRig | null>(null);
  if (!rig.current) rig.current = new CameraRig(resolveTarget("all", layout, state));
  const seen = useRef(n);
  useEffect(() => {
    if (n === seen.current) return;
    seen.current = n;
    if (lvRef.current.view === "graph") rig.current!.moveTo(resolveTarget("all", layout, state), tRef.current);
  }, [n]); // eslint-disable-line

  const focusOn = (id: string) => {
    rig.current!.moveTo(resolveTarget(id, layout, state), tRef.current);
    setLv({ view: "focus", focus: id, since: tRef.current });
  };
  const back = () => {
    rig.current!.moveTo(resolveTarget("all", layout, state), tRef.current);
    setLv({ view: "graph", focus: null, since: tRef.current });
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as Element)?.closest?.("input")) back();
    };
    addEventListener("keydown", on);
    window.__harness = {
      mode: "live", duration: Infinity, ready: true, shots: [],
      seek: async () => {},
      view: () => ({ view: lvRef.current.view, focus: lvRef.current.focus }),
    };
    return () => removeEventListener("keydown", on);
  });

  const beatMs = 60000 / (tl?.grid.bpm ?? 128);
  const tb = makeTimebase(t, beatMs, null, "live");
  const cam: Cam = rig.current.seek(t);
  const focusNode = lv.focus ? findNode(state, lv.focus) : undefined;
  const ctx: Ctx = {
    tb, state, take: { ...take, layout }, shot: null, timeline: tl, cam,
    dir: { shot: "live", draft: false, view: lv.view, params: { recDot: false } },
    url: (u) => artifactUrl(take.base, u),
    onCell: (id) => (lv.view === "focus" && lv.focus === id ? back() : focusOn(id)),
    focus: focusNode?.id ?? null,
    viewAge: t - lv.since,
  };
  // a click outside the focus panel (cells stop their own clicks) returns to the graph
  const outside = (e: MouseEvent) => {
    if (lv.view === "focus" && !(e.target as Element).closest("[data-focus], [data-ui]")) back();
  };
  return (
    <div onClick={outside} style={{ position: "absolute", inset: 0 }}>
      <Frame ctx={ctx} />
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ fixture or recorded take

export function FixtureLive() {
  const q = new URLSearchParams(location.search);
  return <Replay id={q.get("fixture") ?? q.get("take") ?? "main"} start={Number(q.get("start") ?? 0)} />;
}

/** a recorded take played on the wall clock; `children` sit over the stage */
function Replay({ id, start = 0, children }: { id: string; start?: number; children?: ReactNode }) {
  const clock = useMemo(() => new Clock("live", start), [start]);
  const t = useClock(clock);
  const [take, setTake] = useState<Take | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [tk, timeline] = await Promise.all([loadTake(id), loadTimeline().catch(() => null)]);
      if (!tk) throw new Error(`no take or fixture named ${id}`);
      await preloadTake(tk);
      setTl(timeline);
      setTake(tk);
    })().catch((e) => setErr(String(e?.message ?? e)));
    return () => clock.stop();
  }, [clock]); // eslint-disable-line

  if (err) return <Message text={err} />;
  if (!take) return null;
  return <LiveStage take={take} t={t} tl={tl}>{children}</LiveStage>;
}

// ------------------------------------------------------------------ bridge

const runParam = () => new URLSearchParams(location.search).get("run");

/** the take the site replays when no bridge answers (bundled into the deployed site) */
export const REPLAY_TAKE = "main";

export function BridgeLive() {
  const [s, setS] = useState<BridgeSettings>(loadSettings);
  const [run, setRun] = useState<string | null>(runParam);
  const [sheet, setSheet] = useState(false);
  const [tl, setTl] = useState<Timeline | null>(null);
  // whether a bridge answers at the address: "down" plays the bundled take instead
  const [reach, setReach] = useState<"checking" | "up" | "down">("checking");

  const probe = (c: BridgeSettings) =>
    api(c, "/health").then(
      () => "up" as const,
      (x) => (/failed to fetch|networkerror|load failed/i.test(String((x as Error)?.message ?? x)) ? ("down" as const) : ("up" as const)),
    );
  useEffect(() => {
    void probe(s).then((r) => {
      setReach(r);
      if (r === "up" && !s.token) setSheet(true);
    });
    loadTimeline().then(setTl, () => {});
    const on = () => setRun(runParam());
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  const open = (id: string | null) => {
    history.pushState(null, "", id ? `?run=${encodeURIComponent(id)}` : location.pathname);
    setRun(id);
  };
  const save = (n: BridgeSettings) => {
    saveSettings(n);
    setS(n);
    void probe(n).then(setReach);
  };

  if (reach === "checking") return null;
  const sheetEl = sheet ? <SettingsSheet s={s} onSave={save} onClose={() => setSheet(false)} /> : null;
  if (reach === "down")
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <Replay id={REPLAY_TAKE}>
          <div data-ui style={{ position: "absolute", right: 40, top: 36, display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ color: color.dim, font: `500 22px ${font.ui}`, background: color.panel, border: `1px solid ${color.line}`, borderRadius: size.radius, padding: "10px 16px" }}>
              A replay. Connect a bridge in Settings to start your own run.
            </div>
            <RoundButton title="Settings" onClick={() => setSheet(true)}><Icon name="cog" size={26} /></RoundButton>
          </div>
        </Replay>
        {sheetEl}
      </div>
    );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {run ? <RunView key={`${run}|${s.address}|${s.token}`} s={s} run={run} tl={tl} onNew={() => open(null)} onSettings={() => setSheet(true)} />
        : <PromptScreen s={s} onRun={open} onSettings={() => setSheet(true)} />}
      {sheetEl}
    </div>
  );
}

const still = (view: ViewName): Ctx => ({
  tb: makeTimebase(0, 60000 / 128, null, "live"), state: emptyState(), take: null, shot: null, timeline: null,
  cam: { x: 0, y: 0, z: 1 }, dir: { shot: "live", draft: false, view, params: {} }, url: (u) => u, focus: null, viewAge: 0,
});

function PromptScreen({ s, onRun, onSettings }: { s: BridgeSettings; onRun: (id: string) => void; onSettings: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string }>(s, "/runs", { prompt });
      onRun(r.id);
    } catch (x) {
      setErr(bridgeError(x));
      setBusy(false);
    }
  };
  const box = (
    <form data-ui onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask for anything" disabled={busy}
        style={{ ...inputReset, flex: 1, font: `500 34px/1.35 ${font.ui}` }} />
      <Mic onText={setText} big />
      <RoundButton title="Start" onClick={() => submit()} disabled={!text.trim() || busy}><Icon name="arrow" size={26} /></RoundButton>
    </form>
  );
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <PromptView ctx={still("prompt")} live={box} />
      {err ? <div data-ui style={{ position: "absolute", left: 0, right: 0, top: size.stageH / 2 + 70, textAlign: "center", color: color.hit, font: `500 22px ${font.mono}` }}>{err}</div> : null}
      <div data-ui style={{ position: "absolute", right: 40, top: 36 }}>
        <RoundButton title="Settings" onClick={onSettings}><Icon name="cog" size={26} /></RoundButton>
      </div>
    </div>
  );
}

function RunView({ s, run, tl, onNew, onSettings }: { s: BridgeSettings; run: string; tl: Timeline | null; onNew: () => void; onSettings: () => void }) {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [up, setUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = () => {};
    let gone = false;
    api<RunMeta>(s, `/runs/${encodeURIComponent(run)}`)
      .then((m) => {
        if (gone) return;
        setMeta(m);
        stop = follow(s, run, (e) => setEvents((prev) => [...prev, e]), setUp);
      })
      .catch((x) => setErr(bridgeError(x)));
    return () => {
      gone = true;
      stop();
    };
  }, [s, run]);

  if (err) return <><Message text={err} /><Corner up={false} onNew={onNew} onSettings={onSettings} /></>;
  if (!meta) return null;
  return <RunStage s={s} meta={meta} events={events} up={up} tl={tl} onNew={onNew} onSettings={onSettings} />;
}

function RunStage({ s, meta, events, up, tl, onNew, onSettings }: {
  s: BridgeSettings; meta: RunMeta; events: HarnessEvent[]; up: boolean; tl: Timeline | null; onNew: () => void; onSettings: () => void;
}) {
  // t is the wall clock since the run started (the bridge stamps events the same way)
  const clock = useMemo(() => new Clock("live", Math.max(0, Date.now() - meta.startedAt)), [meta]);
  useEffect(() => () => clock.stop(), [clock]);
  const now = useClock(clock);
  const take = useMemo(() => (events.length ? makeTake(meta.id, events, artifactBase(s, meta.id), false) : null), [events, meta.id, s]);
  useEffect(() => {
    void checkMakers(events);
  }, [events]);
  const ui = (
    <>
      <Corner up={up} onNew={onNew} onSettings={onSettings} />
      <SayBar s={s} run={meta.id} />
    </>
  );
  if (!take) return <><Message text="Starting" />{ui}</>;
  // never draw behind the newest event the bridge sent (a clock a little behind the bridge's)
  const t = Math.max(now, take.end);
  return <LiveStage take={take} t={t} tl={tl}>{ui}</LiveStage>;
}

function Corner({ up, onNew, onSettings }: { up: boolean; onNew: () => void; onSettings: () => void }) {
  return (
    <div data-ui style={{ position: "absolute", right: 40, top: 36, display: "flex", gap: 14, alignItems: "center" }}>
      <span title={up ? "Following the run" : "Reconnecting"} style={{ width: 12, height: 12, borderRadius: 6, background: up ? color.ok : color.dim }} />
      <RoundButton title="New prompt" onClick={onNew}><Icon name="spark" size={24} /></RoundButton>
      <RoundButton title="Settings" onClick={onSettings}><Icon name="cog" size={24} /></RoundButton>
    </div>
  );
}

/** follow-up prompts go into the same run */
function SayBar({ s, run }: { s: BridgeSettings; run: string }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const say = text.trim();
    if (!say) return;
    try {
      await api(s, `/runs/${encodeURIComponent(run)}/say`, { text: say });
      setText("");
      setErr(null);
    } catch (x) {
      setErr(bridgeError(x));
    }
  };
  return (
    <form data-ui onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{
      position: "absolute", left: size.stageW / 2 - 440, bottom: 40, width: 880, display: "flex", alignItems: "center", gap: 14,
      padding: "14px 22px", boxSizing: "border-box", borderRadius: size.radius + 4, background: color.panel, border: `1px solid ${color.lineStrong}`,
    }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={err ?? "Ask for more"}
        style={{ ...inputReset, flex: 1, font: `500 24px ${font.ui}` }} />
      <Mic onText={setText} />
      <RoundButton title="Send" onClick={() => submit()} disabled={!text.trim()}><Icon name="arrow" size={22} /></RoundButton>
    </form>
  );
}

function Mic({ onText, big }: { onText: (t: string) => void; big?: boolean }) {
  const Rec = speech();
  const [on, setOn] = useState(false);
  const rec = useRef<{ stop(): void } | null>(null);
  const toggle = () => {
    if (!Rec) return;
    if (on) return rec.current?.stop();
    const r = new Rec();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => onText(Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>).map((x) => x[0].transcript).join(""));
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <RoundButton title={Rec ? (on ? "Stop listening" : "Speak") : "This browser has no speech input"} onClick={toggle} disabled={!Rec} active={on}>
      <Icon name="mic" size={big ? 26 : 22} />
    </RoundButton>
  );
}

function SettingsSheet({ s, onSave, onClose }: { s: BridgeSettings; onSave: (s: BridgeSettings) => void; onClose: () => void }) {
  const [address, setAddress] = useState(s.address);
  const [token, setToken] = useState(s.token);
  const [bridge, setBridge] = useState<string>("Checking");
  const [proxy, setProxy] = useState<ProxyStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cur: BridgeSettings = { address: address.trim(), token: token.trim() };

  const check = async (c: BridgeSettings) => {
    setBridge("Checking");
    try {
      await api(c, "/health");
      setBridge("Connected");
      setProxy(await api<ProxyStatus>(c, "/proxy/status").catch(() => null));
    } catch (x) {
      setBridge(bridgeError(x));
      setProxy(null);
    }
  };
  useEffect(() => {
    void check(s);
  }, []); // eslint-disable-line

  const signIn = async () => {
    try {
      const r = await api<{ url: string }>(cur, "/proxy/signin");
      window.open(r.url, "_blank", "noopener");
      setNote("Finish signing in on the page that opened, then press Save to check again.");
    } catch (x) {
      setNote(bridgeError(x));
    }
  };
  const proxyLine = !proxy ? "Unknown" : !proxy.up ? "The model proxy is not running" : proxy.connected ? "Connected" : "Not connected";

  return (
    <div data-ui onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "absolute", right: 40, top: 100, width: 620, padding: 36, boxSizing: "border-box", borderRadius: size.radius + 6,
        background: color.panel, border: `1px solid ${color.lineStrong}`, color: color.text, font: `500 22px ${font.ui}`,
        display: "flex", flexDirection: "column", gap: 22,
      }}>
        <div style={{ font: `600 30px ${font.ui}` }}>Settings</div>
        <Field label="Bridge address"><input value={address} onChange={(e) => setAddress(e.target.value)} style={field} /></Field>
        <Field label="Pairing token"><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Printed by the bridge when it starts" style={field} /></Field>
        <Status label="Bridge" value={bridge} ok={bridge === "Connected"} />
        <Status label="AI subscription" value={proxyLine} ok={!!proxy?.connected} />
        <button type="button" onClick={signIn} disabled={!proxy?.up} style={{ ...button, opacity: proxy?.up ? 1 : 0.4 }}>Connect your AI subscription</button>
        {note ? <div style={{ color: color.dim, font: `500 18px ${font.ui}` }}>{note}</div> : null}
        <div style={{ display: "flex", gap: 14, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ ...button, background: "transparent" }}>Close</button>
          <button type="button" onClick={() => { onSave(cur); void check(cur); }} style={{ ...button, borderColor: color.accent }}>Save</button>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <span style={{ color: color.dim, font: `500 18px ${font.mono}` }}>{label}</span>
    {children}
  </label>
);
const Status = ({ label, value, ok }: { label: string; value: string; ok: boolean }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
    <span style={{ color: color.dim }}>{label}</span>
    <span style={{ color: ok ? color.ok : color.text, textAlign: "right" }}>{value}</span>
  </div>
);

function RoundButton({ children, title, onClick, disabled, active }: { children: ReactNode; title: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
      width: 56, height: 56, flex: "none", borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center",
      background: active ? color.accent : color.bg, color: active ? color.black : color.text, cursor: disabled ? "default" : "pointer",
      border: `1px solid ${active ? color.accent : color.lineStrong}`, opacity: disabled ? 0.4 : 1, padding: 0,
    }}>{children}</button>
  );
}

function bridgeError(x: unknown): string {
  const m = (x as Error)?.message ?? String(x);
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "The bridge is not reachable at this address";
  if (/unauthorized|401/i.test(m)) return "The pairing token is missing or wrong";
  return m;
}

const inputReset: CSSProperties = { background: "transparent", border: "none", outline: "none", color: color.text, minWidth: 0, padding: 0 };
const field: CSSProperties = {
  ...inputReset, font: `500 22px ${font.mono}`, padding: "12px 16px", borderRadius: size.radius, border: `1px solid ${color.lineStrong}`, background: color.bg,
};
const button: CSSProperties = {
  font: `600 22px ${font.ui}`, color: color.text, background: color.bg, border: `1px solid ${color.lineStrong}`, borderRadius: size.radius,
  padding: "14px 22px", cursor: "pointer",
};
