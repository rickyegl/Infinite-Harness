// Event protocol: one JSON object per line in runs/<run>/events.jsonl, and the same objects over the
// WebSocket. This file mirrors "Event protocol" in plan/00-contract.md; change both in the same commit.

export type NodeKind = "root" | "orchestrator" | "agent" | "tool";
export type NodeStateName = "queued" | "running" | "waiting" | "done" | "failed";
export type EvidenceKind =
  | "image" | "frames" | "video" | "model3d" | "audio" | "chart" | "doc" | "code" | "link";

export type Base = {
  seq: number;
  /** ms since run start */
  t: number;
  run: string;
  node: string;
};

export type RunStart = { type: "run.start"; prompt: string };
export type NodeSpawn = {
  type: "node.spawn";
  parent: string | null;
  module: string;
  label: string;
  kind: NodeKind;
  prompt?: string;
  /** icon id of the non-LLM generator (contract, "Maker icons"); never printed as text */
  maker?: string;
};
export type NodeStateEv = { type: "node.state"; state: NodeStateName };
export type NodeStep = { type: "node.step"; title: string; detail?: string; icon?: string };
export type NodeEvidence = {
  type: "node.evidence";
  kind: EvidenceKind;
  uri: string;
  thumb?: string;
  caption?: string;
  meta?: Record<string, unknown>;
};
export type NodeRequest = { type: "node.request"; to: string; what: string; requestId: string };
export type NodeDeliver = { type: "node.deliver"; to: string; requestId: string; uri: string };
export type NodeOutput = { type: "node.output"; name: string; uri: string; kind: string; href?: string };
export type NodeDone = { type: "node.done"; summary: string };
export type NodeError = { type: "node.error"; message: string };
export type RunDone = { type: "run.done" };

export type Payload =
  | RunStart | NodeSpawn | NodeStateEv | NodeStep | NodeEvidence | NodeRequest | NodeDeliver
  | NodeOutput | NodeDone | NodeError | RunDone;

export type HarnessEvent = Base & Payload;
export type EventType = HarnessEvent["type"];
export type EventOf<T extends EventType> = Extract<HarnessEvent, { type: T }>;

export const EVENT_TYPES: readonly EventType[] = [
  "run.start", "node.spawn", "node.state", "node.step", "node.evidence", "node.request",
  "node.deliver", "node.output", "node.done", "node.error", "run.done",
];

/** Parse an events.jsonl text. Blank lines are skipped; a bad line throws with its line number. */
export function parseJsonl(text: string): HarnessEvent[] {
  const out: HarnessEvent[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch (e) {
      throw new Error(`events line ${i + 1}: not JSON (${(e as Error).message})`);
    }
    const problem = checkEvent(ev);
    if (problem) throw new Error(`events line ${i + 1}: ${problem}`);
    out.push(ev as HarnessEvent);
  }
  return out;
}

/** Returns a description of what is wrong with `ev`, or null when it is a valid event. */
export function checkEvent(ev: unknown): string | null {
  if (!ev || typeof ev !== "object") return "not an object";
  const e = ev as Record<string, unknown>;
  if (typeof e.seq !== "number") return "seq must be a number";
  if (typeof e.t !== "number" || e.t < 0) return "t must be a number >= 0";
  if (typeof e.run !== "string") return "run must be a string";
  if (typeof e.node !== "string") return "node must be a string";
  if (!EVENT_TYPES.includes(e.type as EventType)) return `unknown type ${String(e.type)}`;
  const need = (k: string) => (typeof e[k] === "string" ? null : `${e.type} needs string ${k}`);
  switch (e.type) {
    case "run.start": return need("prompt");
    case "node.spawn":
      if (e.parent !== null && typeof e.parent !== "string") return "node.spawn parent must be string or null";
      return need("module") ?? need("label") ?? need("kind");
    case "node.state": return need("state");
    case "node.step": return need("title");
    case "node.evidence": return need("kind") ?? need("uri");
    case "node.request": return need("to") ?? need("what") ?? need("requestId");
    case "node.deliver": return need("to") ?? need("requestId") ?? need("uri");
    case "node.output": return need("name") ?? need("uri") ?? need("kind");
    case "node.done": return need("summary");
    case "node.error": return need("message");
    default: return null;
  }
}
