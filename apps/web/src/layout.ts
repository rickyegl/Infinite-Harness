// Deterministic graph layout: a tidy tree (d3-hierarchy) in polar form around the root, plus a small
// offset seeded by node id so it reads as organic, not gridded. Sub-orchestrators' children land in their
// parent's angular sector, one ring further out, so each one reads as its own tree.
//
// The layout is computed once from the *whole* take, so a cell never moves when its siblings appear;
// new cells ease out of their parent (see cellPos).

import { hierarchy, tree } from "d3-hierarchy";
import type { GraphState, NodeView } from "@harness/protocol";
import { size } from "./theme.ts";

export type Pt = { x: number; y: number };
export type Layout = { pos: Record<string, Pt>; bounds: { x0: number; y0: number; x1: number; y1: number } };

const RING = [0, 360, 640, 880, 1080, 1260];
const ringR = (d: number) => RING[Math.min(d, RING.length - 1)] + Math.max(0, d - RING.length + 1) * 180;

/** 32-bit FNV-1a of a string -> [0, 1) */
export function hash01(s: string, salt = 0): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function computeLayout(s: GraphState): Layout {
  const pos: Record<string, Pt> = {};
  if (!s.root) return { pos, bounds: { x0: -1, y0: -1, x1: 1, y1: 1 } };
  type D = { id: string; children: D[] };
  const build = (id: string): D => ({ id, children: s.nodes[id].children.map(build) });
  // extra roots (merged takes) hang off the main root
  const others = s.order.filter((id) => s.nodes[id].parent === null && id !== s.root);
  const data = build(s.root);
  for (const o of others) data.children.push(build(o));

  const h = hierarchy<D>(data);
  const t = tree<D>()
    .size([Math.PI * 2, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(1, a.depth));
  const laid = t(h);
  // rotate so the first child sits a little left of straight up: reads as a bloom, not a clock face
  const rot = -Math.PI / 2 - 0.35;
  laid.each((n) => {
    const id = n.data.id;
    if (n.depth === 0) {
      pos[id] = { x: 0, y: 0 };
      return;
    }
    const a = n.x + rot + (hash01(id, 1) - 0.5) * 0.06;
    const r = ringR(n.depth) + (hash01(id, 2) - 0.5) * 40;
    pos[id] = { x: Math.cos(a) * r * 1.25, y: Math.sin(a) * r * 0.9 };
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of Object.values(pos)) {
    x0 = Math.min(x0, p.x - size.cellW / 2);
    x1 = Math.max(x1, p.x + size.cellW / 2);
    y0 = Math.min(y0, p.y - size.cellH / 2);
    y1 = Math.max(y1, p.y + size.cellH / 2);
  }
  return { pos, bounds: { x0, y0, x1, y1 } };
}

const EASE_IN_MS = 650;

/** Where a cell is drawn: it eases from its parent's position over EASE_IN_MS of display time. */
export function cellPos(layout: Layout, n: NodeView, age: number): Pt {
  const end = layout.pos[n.id] ?? { x: 0, y: 0 };
  if (!n.parent) return end;
  const from = layout.pos[n.parent] ?? end;
  const f = easeOut(Math.min(1, Math.max(0, age / EASE_IN_MS)));
  return { x: from.x + (end.x - from.x) * f, y: from.y + (end.y - from.y) * f };
}

export const easeOut = (f: number) => 1 - Math.pow(1 - f, 3);
export const easeInOut = (f: number) => (f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2);
export const clamp01 = (f: number) => Math.min(1, Math.max(0, f));
