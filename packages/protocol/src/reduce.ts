// reduce(events, t) -> GraphState. The picture at time t is a pure function of the events with
// event.t <= t (contract, "UI = f(events, t)"). No hidden state, no clock reads, no randomness.

import type { EvidenceKind, HarnessEvent, NodeKind, NodeStateName } from "./events.ts";

export type StepRec = { t: number; seq: number; title: string; detail?: string; icon?: string };
export type EvidenceRec = {
  t: number; seq: number; kind: EvidenceKind; uri: string; thumb?: string; caption?: string;
  meta?: Record<string, unknown>;
};
export type OutputRec = { t: number; seq: number; node: string; name: string; uri: string; kind: string; href?: string };

export type NodeView = {
  id: string;
  parent: string | null;
  module: string;
  label: string;
  kind: NodeKind;
  prompt?: string;
  maker?: string;
  state: NodeStateName;
  /** time of the node.spawn event */
  spawnedAt: number;
  /** time of the latest state change (spawn counts as "queued") */
  stateAt: number;
  doneAt?: number;
  summary?: string;
  error?: string;
  depth: number;
  children: string[];
  steps: StepRec[];
  evidence: EvidenceRec[];
  outputs: OutputRec[];
};

export type Flight = {
  requestId: string;
  from: string;
  to: string;
  what: string;
  firedAt: number;
  deliveredAt?: number;
  uri?: string;
};

export type GraphState = {
  t: number;
  run: string | null;
  prompt: string | null;
  startedAt: number | null;
  doneAt: number | null;
  root: string | null;
  nodes: Record<string, NodeView>;
  /** node ids in spawn order */
  order: string[];
  flights: Flight[];
  outputs: OutputRec[];
  /** t of the newest event applied, or null */
  lastT: number | null;
};

export function emptyState(t = 0): GraphState {
  return {
    t, run: null, prompt: null, startedAt: null, doneAt: null, root: null, nodes: {}, order: [],
    flights: [], outputs: [], lastT: null,
  };
}

/**
 * Applies every event with event.t <= t, in seq order. Events for a node that has not been spawned
 * yet are ignored (a spawn must come first). The input array is never mutated.
 */
export function reduce(events: readonly HarnessEvent[], t: number = Infinity): GraphState {
  const s = emptyState(t);
  const sorted = isSortedBySeq(events) ? events : [...events].sort((a, b) => a.seq - b.seq);
  for (const e of sorted) {
    if (e.t > t) continue;
    apply(s, e);
    s.lastT = s.lastT === null ? e.t : Math.max(s.lastT, e.t);
  }
  return s;
}

function isSortedBySeq(events: readonly HarnessEvent[]): boolean {
  for (let i = 1; i < events.length; i++) if (events[i].seq < events[i - 1].seq) return false;
  return true;
}

function apply(s: GraphState, e: HarnessEvent): void {
  if (e.type === "run.start") {
    s.run = e.run;
    s.prompt = e.prompt;
    s.startedAt = e.t;
    return;
  }
  if (e.type === "run.done") {
    s.doneAt = e.t;
    return;
  }
  if (e.type === "node.spawn") {
    if (s.nodes[e.node]) return; // a node is spawned once
    const parent = e.parent && s.nodes[e.parent] ? e.parent : null;
    const n: NodeView = {
      id: e.node, parent, module: e.module, label: e.label, kind: e.kind, state: "queued",
      spawnedAt: e.t, stateAt: e.t, depth: parent ? s.nodes[parent].depth + 1 : 0,
      children: [], steps: [], evidence: [], outputs: [],
    };
    if (e.prompt !== undefined) n.prompt = e.prompt;
    if (e.maker !== undefined) n.maker = e.maker;
    s.nodes[e.node] = n;
    s.order.push(e.node);
    if (parent) s.nodes[parent].children.push(e.node);
    if (e.kind === "root" && !s.root) s.root = e.node;
    return;
  }
  const n = s.nodes[e.node];
  if (!n) return;
  switch (e.type) {
    case "node.state":
      n.state = e.state;
      n.stateAt = e.t;
      if (e.state === "done" || e.state === "failed") n.doneAt = e.t;
      return;
    case "node.step":
      n.steps.push(strip({ t: e.t, seq: e.seq, title: e.title, detail: e.detail, icon: e.icon }));
      return;
    case "node.evidence":
      n.evidence.push(strip({ t: e.t, seq: e.seq, kind: e.kind, uri: e.uri, thumb: e.thumb, caption: e.caption, meta: e.meta }));
      return;
    case "node.request":
      s.flights.push({ requestId: e.requestId, from: e.node, to: e.to, what: e.what, firedAt: e.t });
      return;
    case "node.deliver": {
      const f = s.flights.find((x) => x.requestId === e.requestId);
      if (f) {
        f.deliveredAt = e.t;
        f.uri = e.uri;
      }
      return;
    }
    case "node.output": {
      const o: OutputRec = strip({ t: e.t, seq: e.seq, node: e.node, name: e.name, uri: e.uri, kind: e.kind, href: e.href });
      n.outputs.push(o);
      s.outputs.push(o);
      return;
    }
    case "node.done":
      n.summary = e.summary;
      n.state = "done";
      n.stateAt = e.t;
      n.doneAt = e.t;
      return;
    case "node.error":
      n.error = e.message;
      n.state = "failed";
      n.stateAt = e.t;
      n.doneAt = e.t;
      return;
  }
}

function strip<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

// ---------- small queries the views share ----------

export function latestEvidence(n: NodeView, kind?: EvidenceKind): EvidenceRec | undefined {
  for (let i = n.evidence.length - 1; i >= 0; i--) if (!kind || n.evidence[i].kind === kind) return n.evidence[i];
  return undefined;
}

/** All descendants of `id` (not including it), depth first in spawn order. */
export function descendants(s: GraphState, id: string): string[] {
  const out: string[] = [];
  const walk = (x: string) => {
    for (const c of s.nodes[x]?.children ?? []) {
      out.push(c);
      walk(c);
    }
  };
  walk(id);
  return out;
}

/** Ancestors of `id` from its parent up to the root. */
export function ancestors(s: GraphState, id: string): string[] {
  const out: string[] = [];
  let p = s.nodes[id]?.parent ?? null;
  while (p) {
    out.push(p);
    p = s.nodes[p]?.parent ?? null;
  }
  return out;
}

/** Finds a node by id, or else by its label path ("Unity > Karts") or plain label. */
export function findNode(s: GraphState, ref: string): NodeView | undefined {
  if (s.nodes[ref]) return s.nodes[ref];
  const parts = ref.split(">").map((x) => x.trim().toLowerCase());
  const leaf = parts[parts.length - 1];
  return s.order
    .map((id) => s.nodes[id])
    .find((n) => {
      if (n.label.toLowerCase() !== leaf) return false;
      let p = n.parent;
      for (let i = parts.length - 2; i >= 0; i--) {
        while (p && s.nodes[p].label.toLowerCase() !== parts[i]) p = s.nodes[p].parent;
        if (!p) return false;
        p = s.nodes[p].parent;
      }
      return true;
    });
}
