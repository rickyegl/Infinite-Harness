// The eight views. Each is a function of the frame context (events reduced at t, timebase, camera, params).

import { findNode, latestEvidence, type EvidenceRec, type NodeView } from "@harness/protocol";
import type { CSSProperties, ReactNode } from "react";
import { P, type Ctx } from "./ctx.ts";
import { Evidence, FrameClip, Thumb } from "./evidence.tsx";
import { GraphLayer, MiniGraph } from "./graph.tsx";
import { Icon, NeutralMaker, iconFor } from "./icons.tsx";
import { clamp01, easeInOut, easeOut, hash01 } from "./layout.ts";
import { makerIcon } from "./data.ts";
import { color, font, glow, hexAlpha, size } from "./theme.ts";

const SW = size.stageW, SH = size.stageH;
const abs: CSSProperties = { position: "absolute", inset: 0 };

// ---------------------------------------------------------------- prompt

type Chip = { label: string; sub?: string[]; replaces?: string; dot?: boolean; globe?: boolean; beat?: number };

export function PromptView({ ctx, live }: { ctx: Ctx; live?: ReactNode }) {
  const { tb } = ctx;
  const beats = ctx.shot?.beats ?? 8;
  const appear = P<number | null>(ctx, "appear", null);
  const appearF = appear === null ? 1 : clamp01((tb.tau - tb.beat(appear)) / 260);
  const slam = P(ctx, "slam", false);
  const slamF = slam ? easeOut(clamp01(tb.tau / 140)) : 1;
  const push = P(ctx, "push", 0);
  const zoom = (1 + push * (tb.tau / (beats * tb.beatMs))) * (slam ? 1.5 - 0.5 * slamF : 1);
  const enter = P<number | null>(ctx, "enter", null);
  const punch = enter !== null ? Math.max(0, 1 - Math.abs(tb.tau - tb.beat(enter)) / 60) : 0;

  // text: prior + this shot's words, typed word by word over typeBeats
  const prior = P(ctx, "prior", "");
  const say = P(ctx, "say", ctx.shot?.say ?? "");
  const [b0, b1] = P<[number, number]>(ctx, "typeBeats", [0, Math.max(1, beats * 0.75)]);
  const words = say.split(/\s+/).filter(Boolean);
  const typed = words.length ? Math.min(words.length, Math.floor(clamp01((tb.tau - tb.beat(b0)) / Math.max(1, tb.beat(b1) - tb.beat(b0))) * words.length + (tb.tau >= tb.beat(b0) ? 1 : 0))) : 0;
  const text = [prior, words.slice(0, typed).join(" ")].filter(Boolean).join(" ");
  const caretOn = Math.floor(tb.tau / (tb.beatMs / 2)) % 2 === 0;

  // chips
  const before = P<Chip[]>(ctx, "chipsBefore", []);
  const chips = P<Chip[]>(ctx, "chips", []);
  const shown: { chip: Chip; age: number }[] = before.map((c) => ({ chip: c, age: 1e6 }));
  for (const c of chips) {
    const a = tb.tau - tb.beat(c.beat ?? 0);
    if (a < 0) continue;
    if (c.replaces) {
      const i = shown.findIndex((s) => s.chip.label === c.replaces);
      if (i >= 0) shown.splice(i, 1);
    }
    shown.push({ chip: c, age: a });
  }
  const ring = P<[number, number] | null>(ctx, "ring", null);
  const ringF = ring ? easeInOut(clamp01((tb.tau - tb.beat(ring[0])) / Math.max(1, tb.beat(ring[1]) - tb.beat(ring[0])))) : before.some((c) => c.label === "Verifier") ? 1 : 0;
  const glitch = P<[number, number] | null>(ctx, "glitch", null);
  const glitchOn = glitch && tb.tau >= tb.beat(glitch[0]) && tb.tau < tb.beat(glitch[1]);
  const gx = glitchOn ? (hash01(String(Math.floor(tb.tau / 40))) - 0.5) * 60 : 0;

  return (
    <div data-view-body="prompt" style={{ ...abs, background: color.bg }}>
      <div style={{ ...abs, transform: `scale(${zoom * (1 + punch * 0.04)}) translateX(${gx}px)`, transformOrigin: "50% 50%" }}>
        <div style={{
          position: "absolute", left: SW / 2 - 560, top: SH / 2 - 80, width: 1120, minHeight: 112, boxSizing: "border-box",
          padding: "30px 40px", borderRadius: size.radius + 8, background: color.panel, opacity: appearF,
          border: `1px solid ${punch > 0 ? color.accent : color.lineStrong}`, boxShadow: glow(color.accent, 0.12 + punch * 0.5, 40),
          font: `500 34px/1.35 ${font.ui}`, color: color.text, transform: `scale(${0.96 + 0.04 * appearF})`,
        }}>
          {live ?? (
            <>
              {text ? <span>{text}</span> : <span style={{ color: color.dim }}>Ask for anything</span>}
              <span style={{ display: "inline-block", width: 3, height: 38, marginLeft: 4, verticalAlign: "-6px", background: color.accent, opacity: caretOn ? 1 : 0 }} />
            </>
          )}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: SH / 2 + 70, display: "flex", justifyContent: "center", gap: 18, flexWrap: "wrap", padding: "0 200px" }}>
          {shown.map(({ chip, age }) => <ChipEl key={chip.label} chip={chip} age={age} tau={tb.tau} beatMs={tb.beatMs} ring={ringF} />)}
        </div>
      </div>
    </div>
  );
}

function ChipEl({ chip, age, tau, beatMs, ring }: { chip: Chip; age: number; tau: number; beatMs: number; ring: number }) {
  const f = easeOut(clamp01(age / 280));
  const blink = Math.floor(tau / beatMs) % 2 === 0;
  const r = 2 * Math.PI * 24;
  return (
    <div style={{ position: "relative", transform: `translateY(${(1 - f) * -60}px) scale(${0.7 + 0.3 * f})`, opacity: f }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 999, background: color.panel,
        border: `1px solid ${hexAlpha(color.accent, 0.45)}`, font: `600 22px ${font.ui}`, color: color.text, boxShadow: glow(color.accent, 0.2, 18) }}>
        <Icon name={iconFor(chip.label.toLowerCase())} size={20} style={{ color: color.accent }} />
        {chip.label}
        {chip.dot ? <span style={{ width: 12, height: 12, borderRadius: 6, background: color.hit, opacity: blink ? 1 : 0.15 }} /> : null}
        {chip.globe ? <Icon name="check" size={18} style={{ color: color.ok }} /> : null}
      </div>
      {chip.sub ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
          {chip.sub.map((s, i) => {
            const g = easeOut(clamp01((age - 120 - i * 90) / 220));
            return <div key={s} style={{ opacity: g, transform: `translateY(${(1 - g) * -16}px)`, padding: "6px 12px", borderRadius: 999, border: `1px solid ${color.lineStrong}`, font: `500 15px ${font.mono}`, color: color.dim }}>{s}</div>;
          })}
        </div>
      ) : null}
      {ring > 0 ? (
        <svg width="100%" height="100%" viewBox="0 0 100 52" preserveAspectRatio="none" style={{ position: "absolute", left: -8, top: -8, width: "calc(100% + 16px)", height: 72 }}>
          <rect x="1" y="1" width="98" height="50" rx="25" fill="none" stroke={color.ok} strokeWidth="1" vectorEffect="non-scaling-stroke"
            strokeDasharray={`${r * 2} ${r * 2}`} strokeDashoffset={(1 - ring) * r * 2} pathLength={r * 2} />
        </svg>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- graph

export function GraphView({ ctx }: { ctx: Ctx }) {
  const { tb, take } = ctx;
  if (!take) return <Empty ctx={ctx} />;
  const intro = P<string | null>(ctx, "intro", null);
  const verify = P(ctx, "verify", false);
  const lit = verify ? ctx.state.order.filter((id) => ctx.state.nodes[id].state === "done") : [];
  const f = intro === "collapse" ? clamp01(tb.tau / (tb.beatMs * 0.75)) : 1;
  return (
    <div data-view-body="graph" style={{ ...abs, background: color.bg }}>
      <Backdrop tau={tb.tau} />
      <GraphLayer state={ctx.state} layout={take.layout} cam={ctx.cam} age={tb.age} url={ctx.url} onCell={ctx.onCell} tau={tb.tau} highlight={lit} />
      {intro === "collapse" && f < 1 ? (
        <div style={{ position: "absolute", left: SW / 2 - 560 * (1 - f) - 110 * f, top: (SH / 2 - 80) * (1 - f) + (SH / 2 - 36) * f,
          width: 1120 * (1 - f) + 220 * f, height: 112 * (1 - f) + 72 * f, borderRadius: size.radius + 8,
          border: `1px solid ${color.accent}`, background: color.panel, opacity: 1 - f * 0.9 }} />
      ) : null}
      <Recorder ctx={ctx} />
    </div>
  );
}

/** the record dot that keeps blinking from S07 on (graph, focus and split views of the main take) */
function Recorder({ ctx }: { ctx: Ctx }) {
  if (!P(ctx, "recDot", true) || !ctx.take || ctx.tb.mode !== "director") return null;
  const on = Math.floor(ctx.tb.tau / ctx.tb.beatMs) % 2 === 0;
  return (
    <div style={{ position: "absolute", right: 48, top: 40, display: "flex", alignItems: "center", gap: 10, font: `600 16px ${font.mono}`, color: color.dim, letterSpacing: 2 }}>
      <span style={{ width: 14, height: 14, borderRadius: 7, background: color.hit, opacity: on ? 1 : 0.2 }} />REC
    </div>
  );
}

function Backdrop({ tau }: { tau: number }) {
  // faint dot field drifting slowly: a function of time, not an animation
  const off = (tau / 80) % 60;
  return (
    <div style={{ ...abs, backgroundImage: `radial-gradient(${hexAlpha(color.white, 0.05)} 1px, transparent 1px)`, backgroundSize: "60px 60px", backgroundPosition: `${off}px ${off * 0.5}px` }} />
  );
}

function Empty({ ctx }: { ctx: Ctx }) {
  return <div style={{ ...abs, background: color.bg, display: "flex", alignItems: "center", justifyContent: "center", color: color.dim, font: `500 22px ${font.mono}` }}>no take for {ctx.shot?.id ?? "this view"}</div>;
}

// ---------------------------------------------------------------- focus

export function FocusView({ ctx }: { ctx: Ctx }) {
  const { tb, take, state } = ctx;
  if (!take) return <Empty ctx={ctx} />;
  const n = ctx.focus ? findNode(state, ctx.focus) ?? findNode(take.final, ctx.focus) : undefined;
  const live = state.nodes[n?.id ?? ""];
  const reveal = easeOut(clamp01((ctx.viewAge - P(ctx, "revealMs", 260)) / 320));
  const kind = P<string | null>(ctx, "kind", null);
  const evs = live ? live.evidence.filter((e) => !kind || e.kind === kind) : [];
  const ev = evs[evs.length - 1];
  const prev = evs[evs.length - 2];
  return (
    <div data-view-body="focus" style={{ ...abs, background: color.bg }}>
      <Backdrop tau={tb.tau} />
      <GraphLayer state={state} layout={take.layout} cam={ctx.cam} age={tb.age} url={ctx.url} tau={tb.tau} dim={1 - reveal * 0.85} highlight={live ? [live.id] : []} onCell={ctx.onCell} />
      {live ? (
        <div data-focus={live.id} style={{ ...abs, opacity: reveal, transform: `scale(${0.92 + 0.08 * reveal})`, display: "grid", gridTemplateColumns: "360px 1fr 320px", gap: 28, padding: "110px 56px 60px" }}>
          <Header n={live} ctx={ctx} />
          <Ticker n={live} ctx={ctx} />
          <div style={{ position: "relative" }}>
            {ev ? <Evidence ev={ev} prev={prev} age={tb.age(ev.t)} url={ctx.url} w={1120} h={760} beatMs={tb.beatMs} mode={tb.mode} /> : <Waiting />}
          </div>
          <Facts n={live} ctx={ctx} />
        </div>
      ) : null}
      <Recorder ctx={ctx} />
    </div>
  );
}

function Header({ n, ctx }: { n: NodeView; ctx: Ctx }) {
  const crumbs = ancestorsLabels(ctx, n);
  return (
    <div style={{ position: "absolute", left: 56, top: 40, display: "flex", alignItems: "baseline", gap: 18 }}>
      <span style={{ font: `500 18px ${font.mono}`, color: color.dim, letterSpacing: 2, textTransform: "uppercase" }}>{crumbs.join("  /  ")}{crumbs.length ? "  /" : ""}</span>
      <span style={{ font: `700 40px ${font.ui}`, color: color.text }}>{n.label}</span>
    </div>
  );
}

function ancestorsLabels(ctx: Ctx, n: NodeView): string[] {
  const out: string[] = [];
  let p = n.parent;
  while (p && ctx.state.nodes[p]) {
    if (ctx.state.nodes[p].kind !== "root") out.unshift(ctx.state.nodes[p].label);
    p = ctx.state.nodes[p].parent;
  }
  return out;
}

function Waiting() {
  return <div style={{ width: "100%", height: "100%", borderRadius: size.radius, border: `1px dashed ${color.lineStrong}` }} />;
}

function Ticker({ n, ctx }: { n: NodeView; ctx: Ctx }) {
  const steps = n.steps.slice(-9);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, font: `500 17px ${font.mono}`, color: color.text, overflow: "hidden" }}>
      <div style={{ font: `600 13px ${font.mono}`, color: color.dim, letterSpacing: 3, marginBottom: 8 }}>STEPS</div>
      {steps.map((s, i) => {
        const a = ctx.tb.age(s.t);
        const f = easeOut(clamp01(a / 160));
        const last = i === steps.length - 1;
        return (
          <div key={s.seq} style={{ display: "flex", gap: 12, alignItems: "flex-start", opacity: f * (last ? 1 : 0.55), transform: `translateX(${(1 - f) * -24}px)` }}>
            <span style={{ color: last && n.state === "running" ? color.accent : color.ok, flex: "none" }}>{last && n.state === "running" ? ">" : "✓"}</span>
            <span>
              {s.title}
              {s.detail ? <div style={{ color: color.dim, fontSize: 13, marginTop: 2 }}>{s.detail}</div> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Facts({ n, ctx }: { n: NodeView; ctx: Ctx }) {
  const el = Math.max(0, (n.doneAt ?? ctx.tb.takeT) - n.spawnedAt) / 1000;
  const tools = [...new Set(n.steps.map((s) => s.icon).filter((x): x is string => !!x))];
  const maker = n.maker ? makerIcon(n.maker) : null;
  const row = (k: string, v: ReactNode) => (
    <div style={{ borderTop: `1px solid ${color.line}`, padding: "14px 0" }}>
      <div style={{ font: `600 12px ${font.mono}`, color: color.dim, letterSpacing: 3 }}>{k}</div>
      <div style={{ font: `600 28px ${font.ui}`, color: color.text, marginTop: 6 }}>{v}</div>
    </div>
  );
  return (
    <div>
      {row("ELAPSED", `${Math.floor(el / 60)}:${String(Math.floor(el % 60)).padStart(2, "0")}`)}
      {row("FILES", n.evidence.length + n.outputs.length)}
      {row("STATE", <span style={{ color: n.state === "done" ? color.ok : n.state === "failed" ? color.hit : color.accent }}>{n.state}</span>)}
      {row("TOOLS", <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{(tools.length ? tools : [iconFor(n.module)]).map((t) => <Icon key={t} name={t} size={26} />)}</div>)}
      {n.maker ? row("MADE WITH", <span data-maker="1" style={{ display: "inline-flex" }}>{maker ? <img src={maker} width={30} height={30} alt="" style={{ filter: "brightness(0) invert(0.92)" }} /> : <NeutralMaker size={30} />}</span>) : null}
    </div>
  );
}

// ---------------------------------------------------------------- split

type Side = { node?: string; kind?: string; label?: string; index?: number };

export function SplitView({ ctx }: { ctx: Ctx }) {
  const { tb, take, state } = ctx;
  if (!take) return <Empty ctx={ctx} />;
  const sides = [P<Side>(ctx, "left", {}), P<Side>(ctx, "right", {})].filter((s) => s.node);
  const litRefs = P<string[]>(ctx, "lit", []);
  const lit = litRefs.map((r) => findNode(state, r)?.id).filter((x): x is string => !!x);
  const cuts = P(ctx, "cuts", false);
  const link = P<number | null>(ctx, "link", null);
  const linkF = link !== null ? easeOut(clamp01((tb.tau - tb.beat(link)) / 200)) : 0;
  const rise = P(ctx, "rise", false);
  const riseF = rise ? easeOut(clamp01(tb.tau / (tb.beatMs * 2))) : 1;
  const full = P(ctx, "full", false);
  const single = sides.length === 1;
  const sw = full ? (single ? SW : SW / 2 - 6) : single ? 1280 : 860, shh = full ? SH : single ? 720 : 620;
  return (
    <div data-view-body="split" style={{ ...abs, background: color.bg }}>
      <GraphLayer state={state} layout={take.layout} cam={ctx.cam} age={tb.age} url={ctx.url} tau={tb.tau} dim={full ? 0 : 0.18} />
      <div style={{ ...abs, display: "flex", alignItems: "center", justifyContent: "center", gap: full ? 12 : 48 }}>
        {sides.map((s, i) => {
          const n = s.node ? findNode(state, s.node) : undefined;
          const evs = n ? n.evidence.filter((e) => !s.kind || e.kind === s.kind) : [];
          const ev = evs[s.index ?? evs.length - 1] ?? evs[evs.length - 1];
          const prev = evs[evs.indexOf(ev) - 1];
          // hard cuts on every beat: jump the clip forward per beat
          const age = ev ? tb.age(ev.t) + (cuts ? Math.floor(tb.tau / tb.beatMs) * 2400 * (i + 1) : 0) : 0;
          const flash = n ? Math.max(0, 1 - tb.age(n.stateAt) / 400) : 0;
          return (
            <div key={i} style={{ position: "relative", width: sw, height: shh, transform: `translateY(${(1 - riseF) * 300}px) scale(${0.5 + 0.5 * riseF})`, opacity: riseF,
              boxShadow: flash > 0.01 ? glow(color.accent, flash * 0.7, 40) : "none", borderRadius: size.radius }}>
              {ev ? <Evidence ev={ev} prev={prev} age={age} url={ctx.url} w={sw} h={shh} beatMs={tb.beatMs} mode={tb.mode} /> : <Waiting />}
              {s.label && !full ? <div style={{ position: "absolute", left: 0, top: -44, font: `600 20px ${font.mono}`, letterSpacing: 3, color: color.dim, textTransform: "uppercase" }}>{s.label}</div> : null}
            </div>
          );
        })}
      </div>
      {link !== null && linkF > 0 ? (
        <svg width={SW} height={SH} style={{ ...abs, pointerEvents: "none" }}>
          <line x1={SW / 2 - 24} x2={SW / 2 - 24 + 48 * linkF} y1={SH / 2} y2={SH / 2} stroke={color.accent} strokeWidth={6} style={{ filter: `drop-shadow(0 0 12px ${color.accent})` }} />
          <circle cx={SW / 2 - 24} cy={SH / 2} r={8} fill={color.accent} />
          <circle cx={SW / 2 - 24 + 48 * linkF} cy={SH / 2} r={8} fill={color.accent} />
        </svg>
      ) : null}
      {P(ctx, "mini", !full) ? (
        <div style={{ position: "absolute", right: 36, bottom: 32, width: 340, height: 210, borderRadius: size.radius, background: hexAlpha(color.panel, 0.92), border: `1px solid ${color.line}` }}>
          <MiniGraph state={state} layout={take.layout} lit={lit} w={340} h={210} age={tb.age} />
        </div>
      ) : null}
      {!full ? <Recorder ctx={ctx} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- wall

export function WallView({ ctx }: { ctx: Ctx }) {
  const { tb, state } = ctx;
  const layout = P<string>(ctx, "layout", "grid");
  const names = P<string[] | null>(ctx, "items", null);
  const stagger = P(ctx, "stagger", 0.5) * tb.beatMs;
  const outs = names ? names.map((nm) => state.outputs.find((o) => o.name === nm)).filter((o): o is NonNullable<typeof o> => !!o) : state.outputs;
  const evFor = (o: (typeof outs)[number]): EvidenceRec | undefined => {
    const n = state.nodes[o.node];
    return n?.evidence.find((e) => e.uri === o.uri) ?? (n ? latestEvidence(n) : undefined);
  };
  const push = P(ctx, "push", 0);
  const zoom = 1 + push * (tb.tau / Math.max(1, (ctx.shot?.dur ?? 2) * 1000));
  const drift = P(ctx, "drift", 0) * tb.tau / 1000;
  if (layout === "reels") {
    const fadeMs = P(ctx, "fadeBeats", 1) * tb.beatMs;
    return (
      <div data-view-body="wall" style={{ ...abs, background: color.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 56, transform: `scale(${zoom})` }}>
        {outs.map((o, i) => {
          const a = tb.tau - i * stagger;
          const f = easeOut(clamp01(a / fadeMs));
          const ev = evFor(o);
          return (
            <div key={o.name} data-tile={o.name} style={{ width: 486, height: 864, borderRadius: size.radius + 4, overflow: "hidden", position: "relative", opacity: f, transform: `translateY(${(1 - f) * 40}px)`,
              border: `1px solid ${color.lineStrong}`, background: color.panel, boxShadow: i === Math.min(outs.length - 1, Math.floor(tb.tau / stagger)) ? glow(color.accent, 0.4, 40) : "none" }}>
              {ev ? <Evidence ev={ev} age={Math.max(0, a)} url={ctx.url} w={486} h={864} beatMs={tb.beatMs} mode={tb.mode} /> : null}
              <div style={{ position: "absolute", left: 18, top: 16, font: `600 16px ${font.mono}`, letterSpacing: 2, color: color.text, textTransform: "uppercase" }}>{o.name}</div>
            </div>
          );
        })}
      </div>
    );
  }
  const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(outs.length * 1.6))));
  return (
    <div data-view-body="wall" style={{ ...abs, background: color.bg }}>
      <div style={{ ...abs, padding: "110px 120px", display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 28, alignContent: "center", transform: `translateX(${-drift}px) scale(${zoom})` }}>
        {outs.map((o, i) => {
          const a = tb.tau - i * stagger;
          const f = easeOut(clamp01(a / 160));
          const ev = evFor(o);
          return (
            <div key={o.name} data-tile={o.name} style={{ height: 330, borderRadius: size.radius, overflow: "hidden", position: "relative", opacity: f, transform: `scale(${0.85 + 0.15 * f})`, border: `1px solid ${color.lineStrong}`, background: color.panel }}>
              {ev ? <Evidence ev={ev} age={Math.max(0, a)} url={ctx.url} w={420} h={330} beatMs={tb.beatMs} mode={tb.mode} /> : null}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 18px", background: `linear-gradient(transparent, ${hexAlpha(color.bg, 0.9)})`, display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name={o.href ? "link" : iconFor(o.kind)} size={18} style={{ color: color.accent }} />
                <span style={{ font: `600 18px ${font.ui}`, color: color.text }}>{o.name}</span>
                {o.href ? <span style={{ font: `400 13px ${font.mono}`, color: color.dim, marginLeft: "auto" }}>{o.href.replace(/^https?:\/\//, "")}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- banner

export function BannerView({ ctx }: { ctx: Ctx }) {
  const { tb, state, take } = ctx;
  const title = P(ctx, "title", ctx.shot?.module ?? "");
  const say = P(ctx, "say", ctx.shot?.say ?? "");
  const beats = ctx.shot?.beats ?? 4;
  const [b0, b1] = P<[number, number]>(ctx, "typeBeats", [0, Math.min(beats, 4) * 0.6]);
  const chars = Math.floor(clamp01((tb.tau - tb.beat(b0)) / Math.max(1, tb.beat(b1) - tb.beat(b0))) * say.length);
  const ref = ctx.focus;
  const n = ref ? findNode(state, ref) : state.order.length ? state.nodes[[...state.order].reverse().find((id) => state.nodes[id].evidence.length) ?? state.order[state.order.length - 1]] : undefined;
  const kind = P<string | null>(ctx, "kind", null);
  const evs = n ? n.evidence.filter((e) => !kind || e.kind === kind) : [];
  const ev = evs[evs.length - 1], prev = evs[evs.length - 2];
  const crumbs = P<string[]>(ctx, "crumbs", []);
  const graphBehind = P(ctx, "graphBehind", false);
  const titleF = easeOut(clamp01(tb.tau / 160));
  return (
    <div data-view-body="banner" style={{ ...abs, background: color.bg }}>
      {graphBehind && take ? <GraphLayer state={take.final} layout={take.layout} cam={ctx.cam} age={() => 1e6} url={ctx.url} tau={tb.tau} dim={0.25} bare /> : null}
      <div style={{ position: "absolute", left: 0, right: 0, top: 210, bottom: 120, display: "flex", justifyContent: "center" }}>
        {ev ? <Evidence ev={ev} prev={prev} age={tb.age(ev.t)} url={ctx.url} w={1600} h={750} beatMs={tb.beatMs} mode={tb.mode} /> : null}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 44, textAlign: "center", opacity: titleF, transform: `translateY(${(1 - titleF) * -20}px)` }}>
        <div style={{ font: `700 92px/1 ${font.ui}`, letterSpacing: 6, color: color.text, display: "inline-flex", alignItems: "center", gap: 26 }}>
          {n ? <Icon name={iconFor(n.module)} size={70} style={{ color: color.accent }} /> : null}
          {title}
          {n?.maker ? <span data-maker="1" style={{ display: "inline-flex", color: color.dim }}>{makerIcon(n.maker) ? <img src={makerIcon(n.maker)!} width={44} height={44} alt="" style={{ filter: "brightness(0) invert(0.6)" }} /> : <NeutralMaker size={44} />}</span> : null}
        </div>
        <div style={{ marginTop: 18, font: `500 30px ${font.ui}`, color: color.accent, minHeight: 40 }}>
          {say.slice(0, chars)}
          {chars < say.length && chars > 0 ? <span style={{ display: "inline-block", width: 3, height: 30, marginLeft: 3, verticalAlign: "-4px", background: color.accent }} /> : null}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", gap: 12, font: `600 15px ${font.mono}`, letterSpacing: 2, color: color.dim }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "flex", gap: 12, alignItems: "center", color: i === crumbs.length - 1 ? color.text : color.dim }}>
            {i ? <span style={{ color: color.lineStrong }}>›</span> : null}{c}
          </span>
        ))}
      </div>
      {n && ev?.kind !== "image" ? null : null}
    </div>
  );
}

// ---------------------------------------------------------------- rain

export function RainView({ ctx }: { ctx: Ctx }) {
  const { tb, take } = ctx;
  const prompts = ctx.timeline?.rain ?? [];
  const rate = P(ctx, "rate", 1);
  const step = tb.beatMs / rate;
  const offset = P(ctx, "offset", 0);
  const cutAt = P<number | null>(ctx, "cutAt", null);
  const cut = cutAt !== null && tb.tau >= tb.beat(cutAt);
  const k = Math.floor(tb.tau / step);
  const frac = (tb.tau % step) / step;
  const cur = prompts.length ? prompts[(k + offset) % prompts.length] : "";
  const prev = prompts.length ? prompts[(k + offset - 1 + prompts.length) % prompts.length] : "";
  const sw = easeInOut(clamp01(frac / 0.35));
  const title = P<string | null>(ctx, "title", null);
  const blur = rate >= 4 ? 2 : 0;
  return (
    <div data-view-body="rain" style={{ ...abs, background: color.bg }}>
      {take ? <GraphLayer state={take.final} layout={take.layout} cam={ctx.cam} age={() => 1e6} url={ctx.url} tau={tb.tau} dim={0.35} bare /> : null}
      {!cut ? (
        <>
          {title ? <div style={{ position: "absolute", left: 0, right: 0, top: SH / 2 - 210, textAlign: "center", font: `600 64px ${font.ui}`, color: color.text, letterSpacing: 2 }}>{title}</div> : null}
          <div style={{ position: "absolute", left: SW / 2 - 560, top: SH / 2 - 56, width: 1120, height: 112, borderRadius: size.radius + 8, background: color.panel,
            border: `1px solid ${color.lineStrong}`, overflow: "hidden", boxShadow: glow(color.accent, 0.15, 40) }}>
            <div style={{ position: "absolute", left: 40, top: 30, font: `500 34px ${font.ui}`, color: color.text, whiteSpace: "nowrap", transform: `translateX(${-sw * 1200}px)`, filter: `blur(${blur}px)` }}>{prev}</div>
            <div style={{ position: "absolute", left: 40, top: 30, font: `500 34px ${font.ui}`, color: color.text, whiteSpace: "nowrap", transform: `translateX(${(1 - sw) * 1200}px)`, filter: `blur(${blur * (1 - sw)}px)` }}>{cur}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- title

export function TitleView({ ctx }: { ctx: Ctx }) {
  const { tb } = ctx;
  const mode = P<string>(ctx, "mode", "end");
  const sub = P<string | null>(ctx, "sub", null);
  const beats = ctx.shot?.beats ?? 8;
  const total = beats * tb.beatMs;
  let wordF = easeOut(clamp01(tb.tau / 400)), scale = 1, subF = 0, black = 0;
  const small = mode === "fake";
  if (mode === "fake") {
    wordF = easeOut(clamp01((tb.tau - tb.beatMs) / (tb.beatMs * 2)));
    black = clamp01(tb.tau / total) * 0.6;
  }
  if (mode === "implode") {
    wordF = clamp01((tb.tau - tb.beatMs * 0.25) / 120);
    scale = 1 + Math.max(0, 1 - (tb.tau - tb.beatMs * 0.25) / 500) * 0.15;
  }
  if (mode === "end") {
    wordF = 1;
    subF = easeOut(clamp01((tb.tau - tb.beatMs) / 500));
    black = clamp01((tb.tau - (total - tb.beatMs * 3)) / (tb.beatMs * 3));
  }
  const dots = mode === "implode" ? Array.from({ length: 64 }, (_, i) => {
    const a = hash01("d" + i) * Math.PI * 2, r = 400 + hash01("r" + i) * 700;
    const f = easeInOut(clamp01(tb.tau / (tb.beatMs * 0.5)));
    return <div key={i} style={{ position: "absolute", left: SW / 2 + Math.cos(a) * r * (1 - f) - 6, top: SH / 2 + Math.sin(a) * r * 0.6 * (1 - f) - 4, width: 12, height: 8, borderRadius: 3, background: color.accent, opacity: 1 - f * 0.9 }} />;
  }) : null;
  return (
    <div data-view-body="title" style={{ ...abs, background: color.black }}>
      {dots}
      <div style={{ ...abs, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
        <div style={{ font: `700 ${small ? 54 : 128}px/1 ${font.ui}`, letterSpacing: small ? 4 : 2, color: color.text, opacity: wordF, transform: `scale(${scale})`, textShadow: glow(color.accent, 0.35, 24) }}>
          Infinite Harness
        </div>
        {sub ? <div style={{ font: `500 34px ${font.mono}`, letterSpacing: 8, color: color.dim, opacity: subF }}>{sub}</div> : null}
      </div>
      <div style={{ ...abs, background: color.black, opacity: black }} />
    </div>
  );
}

// ---------------------------------------------------------------- live helpers

export function LiveEvidenceHint({ n, url }: { n: NodeView; url: (u: string) => string }) {
  const ev = latestEvidence(n);
  return ev ? <Thumb ev={ev} url={url} w={80} h={80} /> : null;
}

export { FrameClip };
