// Camera: one world transform (x, y, zoom), driven by one paused GSAP timeline that is only ever seeked.
// Director mode builds the timeline from the direction's camera keys; live mode appends a tween when a
// cell is clicked and seeks the same timeline to the live clock.

import gsap from "gsap";
import { findNode, type GraphState } from "@harness/protocol";
import type { CamKey, CamTarget } from "./direction.ts";
import type { Layout } from "./layout.ts";
import { size } from "./theme.ts";

export type Cam = { x: number; y: number; z: number };

const MARGIN = 160;

export function resolveTarget(target: CamTarget, layout: Layout, state: GraphState, zoom = 1): Cam {
  const ids = target === "all" ? Object.keys(layout.pos) : (Array.isArray(target) ? target : [target])
    .map((r) => findNode(state, r)?.id)
    .filter((x): x is string => !!x && !!layout.pos[x]);
  if (!ids.length) return fitBox(layout.bounds, zoom);
  if (ids.length === 1 && target !== "all") {
    const p = layout.pos[ids[0]];
    // a single cell: fit the cell with room around it, then apply the zoom multiplier
    const z = Math.min(size.stageW / (size.cellW * 5), size.stageH / (size.cellH * 8)) * zoom;
    return { x: p.x, y: p.y, z };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const p = layout.pos[id];
    x0 = Math.min(x0, p.x - size.cellW / 2);
    x1 = Math.max(x1, p.x + size.cellW / 2);
    y0 = Math.min(y0, p.y - size.cellH / 2);
    y1 = Math.max(y1, p.y + size.cellH / 2);
  }
  return fitBox({ x0, y0, x1, y1 }, zoom);
}

function fitBox(b: Layout["bounds"], zoom: number): Cam {
  const w = b.x1 - b.x0 + MARGIN * 2, h = b.y1 - b.y0 + MARGIN * 2;
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: Math.min(size.stageW / w, size.stageH / h) * zoom };
}

export class CameraRig {
  readonly cam: Cam;
  private tl: gsap.core.Timeline;

  constructor(initial: Cam) {
    this.cam = { ...initial };
    this.tl = gsap.timeline({ paused: true });
    // anchor so the timeline always has a start state at 0
    this.tl.set(this.cam, { ...initial }, 0);
  }

  /** builds every move from direction keys; beatMs converts beats to seconds on the timeline */
  static fromKeys(keys: CamKey[], beatMs: number, layout: Layout, state: GraphState): CameraRig {
    const sorted = [...keys].sort((a, b) => a.beat - b.beat);
    const first = sorted[0];
    const start = first ? withOffset(resolveTarget(first.target, layout, state, first.zoom), first) : resolveTarget("all", layout, state);
    const rig = new CameraRig(start);
    for (const k of sorted.slice(first && (first.dur ?? 0) === 0 ? 1 : 0)) {
      const c = withOffset(resolveTarget(k.target, layout, state, k.zoom), k);
      const dur = (k.dur ?? 1) * beatMs / 1000;
      if (dur <= 0) rig.tl.set(rig.cam, c, (k.beat * beatMs) / 1000);
      else rig.tl.to(rig.cam, { ...c, duration: dur, ease: k.ease ?? "power2.inOut" }, (k.beat * beatMs) / 1000);
    }
    return rig;
  }

  /** live: move from wherever the camera is at `atMs` to `to` */
  moveTo(to: Cam, atMs: number, durMs = 700, ease = "power3.inOut"): void {
    this.tl.seek(atMs / 1000, true);
    const from = { ...this.cam };
    // drop moves that were scheduled after now, then tween from the current spot
    this.tl.getChildren(false, true, false).forEach((c) => {
      if (c.startTime() >= atMs / 1000) c.kill();
    });
    this.tl.set(this.cam, from, atMs / 1000);
    this.tl.to(this.cam, { ...to, duration: durMs / 1000, ease }, atMs / 1000);
  }

  seek(ms: number): Cam {
    this.tl.seek(Math.max(0, ms) / 1000, true);
    return { ...this.cam };
  }
}

function withOffset(c: Cam, k: CamKey): Cam {
  return { x: c.x + (k.dx ?? 0), y: c.y + (k.dy ?? 0), z: c.z };
}

export function worldTransform(c: Cam): string {
  return `translate(${size.stageW / 2 - c.x * c.z}px, ${size.stageH / 2 - c.y * c.z}px) scale(${c.z})`;
}
