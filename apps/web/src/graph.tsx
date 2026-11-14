// The graph: cells and edges in world coordinates, drawn under the camera transform.

import type { CSSProperties } from "react";
import { latestEvidence, type Flight, type GraphState, type NodeView } from "@harness/protocol";
import { Icon, NeutralMaker, iconFor } from "./icons.tsx";
import { makerIcon } from "./data.ts";
import { Thumb } from "./evidence.tsx";
import { cellPos, clamp01, easeInOut, easeOut, type Layout, type Pt } from "./layout.ts";
import { color, font, glow, hexAlpha, size, stateColor } from "./theme.ts";
import { worldTransform, type Cam } from "./camera.ts";

export type GraphProps = {
  state: GraphState;
  layout: Layout;
  cam: Cam;
  age: (takeMs: number) => number;
  url: (uri: string) => string;
  /** cells to light up (verifier sweep, "this cell just fired") */
  highlight?: string[];
  dim?: number;
  /** hide evidence thumbnails (rain view) */
  bare?: boolean;
  onCell?: (id: string) => void;
  /** ms, live time, for the running ring's spin */
  tau: number;
  style?: CSSProperties;
};

const W = size.cellW, H = size.cellH;

export function GraphLayer(p: GraphProps) {
  const { state, layout } = p;
  const nodes = state.order.map((id) => state.nodes[id]);
  const at = (n: NodeView): Pt => cellPos(layout, n, p.age(n.spawnedAt));
  return (
    <div data-layer="graph" style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: p.dim ?? 1, ...p.style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transformOrigin: "0 0", transform: worldTransform(p.cam) }}>
        <svg style={{ position: "absolute", overflow: "visible", left: 0, top: 0 }} width={1} height={1}>
          {nodes.map((n) => (n.parent ? <Edge key={n.id} a={at(state.nodes[n.parent])} b={at(n)} age={p.age(n.spawnedAt)} n={n} /> : null))}
          {state.flights.map((f, i) => <FlightLight key={`${i}:${f.requestId}`} f={f} state={state} at={at} age={p.age} />)}
        </svg>
        {nodes.map((n) => (
          <Cell key={n.id} n={n} pos={at(n)} age={p.age(n.spawnedAt)} stateAge={p.age(n.stateAt)} url={p.url} bare={p.bare}
            lit={p.highlight?.includes(n.id) ?? false} onCell={p.onCell} tau={p.tau} />
        ))}
      </div>
    </div>
  );
}

function curve(a: Pt, b: Pt): string {
  // bend each edge a little around the root so the tree reads organic
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const k = 0.18;
  return `M${a.x},${a.y} Q${mx - dy * k},${my + dx * k} ${b.x},${b.y}`;
}

function pointOn(a: Pt, b: Pt, f: number): Pt {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const c = { x: mx - dy * 0.18, y: my + dx * 0.18 };
  const u = 1 - f;
  return { x: u * u * a.x + 2 * u * f * c.x + f * f * b.x, y: u * u * a.y + 2 * u * f * c.y + f * f * b.y };
}

function Edge({ a, b, age, n }: { a: Pt; b: Pt; age: number; n: NodeView }) {
  const f = clamp01(age / 500);
  const len = Math.hypot(b.x - a.x, b.y - a.y) * 1.1;
  const done = n.state === "done";
  // light that runs once from parent to child as the edge draws
  const lf = clamp01(age / 650);
  const lp = pointOn(a, b, easeOut(lf));
  return (
    <g>
      <path d={curve(a, b)} fill="none" stroke={done ? hexAlpha(color.ok, 0.35) : color.lineStrong} strokeWidth={1.5}
        strokeDasharray={`${len}`} strokeDashoffset={(1 - f) * len} />
      {lf < 1 ? <circle cx={lp.x} cy={lp.y} r={5} fill={color.accent} style={{ filter: `drop-shadow(0 0 10px ${color.accent})` }} /> : null}
    </g>
  );
}

const TRAVEL = 900;

function FlightLight({ f, state, at, age }: { f: Flight; state: GraphState; at: (n: NodeView) => Pt; age: (t: number) => number }) {
  const from = state.nodes[f.from], to = state.nodes[f.to];
  if (!from || !to) return null;
  const a = at(from), b = at(to);
  const goF = clamp01(age(f.firedAt) / TRAVEL);
  const backF = f.deliveredAt !== undefined ? clamp01(age(f.deliveredAt) / TRAVEL) : 0;
  const els = [];
  // the request: a bright edge drawn across the graph, then a light running along it
  const path = curve(a, b);
  const len = Math.hypot(b.x - a.x, b.y - a.y) * 1.1;
  const inFlight = f.deliveredAt === undefined || backF < 1;
  if (inFlight) {
    els.push(<path key="e" d={path} fill="none" stroke={color.accent} strokeWidth={3} strokeDasharray={`${len}`} strokeDashoffset={(1 - easeInOut(goF)) * len} opacity={0.9} style={{ filter: `drop-shadow(0 0 8px ${color.accent})` }} />);
  }
  if (goF > 0 && goF < 1) {
    const p = pointOn(a, b, easeInOut(goF));
    els.push(<circle key="g" cx={p.x} cy={p.y} r={10} fill={color.white} style={{ filter: `drop-shadow(0 0 18px ${color.accent})` }} />);
    els.push(<text key="w" x={p.x + 16} y={p.y - 14} fill={color.text} style={{ font: `600 18px ${font.mono}` }}>{f.what}</text>);
  }
  if (f.deliveredAt !== undefined && backF > 0 && backF < 1) {
    const p = pointOn(a, b, 1 - easeInOut(backF));
    els.push(<rect key="b" x={p.x - 9} y={p.y - 9} width={18} height={18} rx={4} fill={color.ok} style={{ filter: `drop-shadow(0 0 16px ${color.ok})` }} />);
  }
  return <g>{els}</g>;
}

function Cell({ n, pos, age, stateAge, url, lit, onCell, tau, bare }: {
  n: NodeView; pos: Pt; age: number; stateAge: number; url: (u: string) => string; lit: boolean; onCell?: (id: string) => void; tau: number; bare?: boolean;
}) {
  const root = n.kind === "root";
  const w = root ? size.rootW : W, h = root ? size.rootH : H;
  const pop = easeOut(clamp01(age / 350));
  const sc = 0.6 + 0.4 * pop + Math.max(0, 1 - age / 220) * 0.12 * pop;
  const ring = stateColor[n.state];
  const flash = Math.max(0, 1 - stateAge / 500);
  const ev = bare ? undefined : latestEvidence(n);
  const maker = n.maker ? makerIcon(n.maker) : null;
  const glowing = lit || flash > 0.01;
  return (
    <div data-node={n.id} data-state={n.state} onClick={onCell ? (e) => { e.stopPropagation(); onCell(n.id); } : undefined}
      style={{
        position: "absolute", left: pos.x - w / 2, top: pos.y - h / 2, width: w, height: h, boxSizing: "border-box",
        transform: `scale(${sc})`, opacity: pop, cursor: onCell ? "pointer" : "default",
        background: color.panel, borderRadius: size.radius, border: `1px solid ${lit ? color.ok : n.state === "running" ? hexAlpha(color.accent, 0.5) : color.line}`,
        boxShadow: glowing ? glow(lit ? color.ok : ring, 0.35 + flash * 0.4, 24) : "none",
        display: "flex", alignItems: "center", gap: 10, padding: "0 12px", color: color.text,
      }}>
      <StateRing state={n.state} tau={tau} color={ring} size={root ? 44 : 36}>
        <Icon name={iconFor(n.module)} size={root ? 22 : 18} style={{ color: n.state === "queued" ? color.dim : color.text }} />
      </StateRing>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 ${root ? 18 : 15}px ${font.ui}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</div>
        {n.steps.length ? (
          <div style={{ font: `400 10px ${font.mono}`, color: color.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {n.steps[n.steps.length - 1].title}
          </div>
        ) : null}
      </div>
      {ev ? <div style={{ flex: "none" }}><Thumb ev={ev} url={url} w={40} h={40} /></div> : null}
      {n.children.length ? (
        <div style={{ position: "absolute", top: -9, right: -9, minWidth: 20, height: 20, borderRadius: 10, background: color.bg, border: `1px solid ${color.lineStrong}`,
          font: `600 11px ${font.mono}`, color: color.dim, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", boxSizing: "border-box" }}>
          {n.children.length}
        </div>
      ) : null}
      {n.maker ? (
        <div data-maker="1" style={{ position: "absolute", right: -6, bottom: -6, width: size.badge + 6, height: size.badge + 6, borderRadius: (size.badge + 6) / 2,
          background: color.bg, border: `1px solid ${color.lineStrong}`, display: "flex", alignItems: "center", justifyContent: "center", color: color.text }}>
          {maker ? <img src={maker} width={size.badge - 4} height={size.badge - 4} alt="" style={{ filter: "brightness(0) invert(0.92)" }} /> : <NeutralMaker size={size.badge - 4} />}
        </div>
      ) : null}
    </div>
  );
}

function StateRing({ state, tau, color: c, size: s, children }: { state: NodeView["state"]; tau: number; color: string; size: number; children: React.ReactNode }) {
  const r = s / 2 - 2, C = 2 * Math.PI * r;
  const spin = state === "running" ? ((tau / 1200) % 1) * 360 : 0;
  return (
    <div style={{ position: "relative", width: s, height: s, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={s} height={s} style={{ position: "absolute", inset: 0 }}>
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke={color.line} strokeWidth={2} />
        {state === "running" ? (
          <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke={c} strokeWidth={2} strokeDasharray={`${C * 0.3} ${C}`} transform={`rotate(${spin} ${s / 2} ${s / 2})`} strokeLinecap="round" />
        ) : state === "waiting" ? (
          <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke={c} strokeWidth={2} strokeDasharray="3 5" />
        ) : state === "queued" ? null : (
          <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke={c} strokeWidth={2} />
        )}
      </svg>
      {children}
    </div>
  );
}

/** A small, static picture of the whole graph (split view inset), with lit cells. */
export function MiniGraph({ state, layout, lit, w, h, age }: { state: GraphState; layout: Layout; lit: string[]; w: number; h: number; age: (t: number) => number }) {
  const b = layout.bounds;
  const s = Math.min((w - 24) / (b.x1 - b.x0), (h - 24) / (b.y1 - b.y0));
  const tx = (x: number) => 12 + (x - b.x0) * s, ty = (y: number) => 12 + (y - b.y0) * s;
  const nodes = state.order.map((id) => state.nodes[id]);
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      {nodes.map((n) => {
        if (!n.parent) return null;
        const a = cellPos(layout, state.nodes[n.parent], age(state.nodes[n.parent].spawnedAt)), c = cellPos(layout, n, age(n.spawnedAt));
        return <line key={"e" + n.id} x1={tx(a.x)} y1={ty(a.y)} x2={tx(c.x)} y2={ty(c.y)} stroke={color.lineStrong} strokeWidth={1} />;
      })}
      {nodes.map((n) => {
        const p = cellPos(layout, n, age(n.spawnedAt));
        const isLit = lit.includes(n.id);
        const flash = isLit ? 0.5 + 0.5 * Math.max(0, 1 - age(n.stateAt) / 600) : 0;
        return (
          <g key={n.id}>
            {isLit ? <circle cx={tx(p.x)} cy={ty(p.y)} r={14} fill={hexAlpha(color.accent, 0.25 * flash + 0.1)} /> : null}
            <circle cx={tx(p.x)} cy={ty(p.y)} r={n.kind === "root" ? 6 : 4} fill={isLit ? color.accent : stateColor[n.state]} />
            {isLit ? <text x={tx(p.x) + 12} y={ty(p.y) + 5} fill={color.text} style={{ font: `600 14px ${font.mono}` }}>{n.label}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
