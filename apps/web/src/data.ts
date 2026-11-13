// Loading: timeline, direction files, takes (or their fixtures), maker icons; and preloading every
// image a shot can show, so a seek never waits on the network.

import { parseJsonl, reduce, type GraphState, type HarnessEvent } from "@harness/protocol";
import { TimeMap, type Direction, type ViewName } from "./direction.ts";
import { computeLayout, type Layout } from "./layout.ts";

export type Shot = {
  id: string; act: number; bar: number; beats: number; view: ViewName; source: string; take?: string;
  module?: string; say: string; screen: string; camera: string; fx: string;
  startBeat: number; start: number; end: number; dur: number; elastic?: boolean;
};
export type Timeline = { grid: { bpm: number; beatsPerBar: number }; total: number; shots: Shot[]; rain: string[] };

export type Take = {
  id: string;
  events: HarnessEvent[];
  /** base URL that artifact uris are relative to */
  base: string;
  /** true when it came from apps/web/fixtures (no real take yet) */
  fixture: boolean;
  final: GraphState;
  layout: Layout;
  end: number;
};

export type ShotData = {
  shot: Shot;
  dir: Direction;
  take: Take | null;
  map: TimeMap | null;
  /** range-relative start, ms */
  at: number;
  durMs: number;
};

const getJson = async <T,>(url: string): Promise<T | null> => {
  const r = await fetch(url);
  if (!r.ok) return null;
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
};
const getText = async (url: string): Promise<string | null> => {
  const r = await fetch(url);
  if (!r.ok) return null;
  const type = r.headers.get("content-type") ?? "";
  if (type.includes("text/html")) return null; // the dev server's index fallback, not the file
  return r.text();
};

export async function loadTimeline(): Promise<Timeline> {
  const t = await getJson<Timeline>("/video/timeline.json");
  if (!t) throw new Error("video/timeline.json not found");
  return t;
}

const takeCache = new Map<string, Promise<Take | null>>();

export function loadTake(id: string): Promise<Take | null> {
  if (!takeCache.has(id)) takeCache.set(id, fetchTake(id));
  return takeCache.get(id)!;
}

async function fetchTake(id: string): Promise<Take | null> {
  let text = await getText(`/video/takes/${id}/events.jsonl`);
  let base = `/video/takes/${id}/`, fixture = false;
  if (text === null) {
    text = await getText(`/fixtures/${id}.jsonl`);
    base = `/fixtures/${id}/`;
    fixture = true;
    if (text !== null) console.warn(`take ${id}: no recorded take yet, using fixture`);
  }
  if (text === null) return null;
  return makeTake(id, parseJsonl(text), base, fixture);
}

export function makeTake(id: string, events: HarnessEvent[], base: string, fixture: boolean): Take {
  const final = reduce(events);
  return { id, events, base, fixture, final, layout: computeLayout(final), end: events.reduce((m, e) => Math.max(m, e.t), 0) };
}

/** Several takes in one graph: node ids are prefixed by take, and every extra root hangs off the first. */
export function mergeTakes(takes: Take[]): Take {
  const [first, ...rest] = takes;
  const events: HarnessEvent[] = [...first.events];
  let seq = events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  const offset = first.end + 1;
  rest.forEach((tk, k) => {
    const pre = (n: string) => `${tk.id}/${n}`;
    for (const e of tk.events) {
      if (e.type === "run.start" || e.type === "run.done") continue;
      const c: any = { ...e, seq: seq++, t: e.t + offset + k, node: pre(e.node) };
      if (c.type === "node.spawn") {
        if (c.kind === "root") {
          // a take's root becomes an ordinary cell under the first root
          c.kind = "orchestrator";
          c.parent = first.final.root;
        } else if (c.parent) c.parent = pre(c.parent);
      }
      if ("to" in c && c.to) c.to = pre(c.to);
      if (c.uri && !String(c.uri).includes("://")) c.uri = new URL(c.uri, location.origin + tk.base).pathname;
      events.push(c as HarnessEvent);
    }
  });
  return makeTake(takes.map((t) => t.id).join("+"), events, first.base, takes.some((t) => t.fixture));
}

export async function loadDirection(shot: Shot): Promise<Direction> {
  const d = await getJson<Direction>(`/video/direction/${shot.id}.json`);
  if (d) return { ...d, view: d.view ?? shot.view };
  console.warn(`direction ${shot.id}: no file, using the shot's view (run node video/tools/direct.mjs)`);
  return { shot: shot.id, draft: true, view: shot.view, take: shot.take };
}

/** Loads every shot in [from, to] (by index in the timeline). */
export async function loadRange(tl: Timeline, from: string, to: string): Promise<ShotData[]> {
  const i0 = tl.shots.findIndex((s) => s.id === from);
  const i1 = tl.shots.findIndex((s) => s.id === to);
  if (i0 < 0) throw new Error(`unknown shot ${from}`);
  if (i1 < 0) throw new Error(`unknown shot ${to}`);
  const list = tl.shots.slice(Math.min(i0, i1), Math.max(i0, i1) + 1);
  const origin = list[0].start;
  return Promise.all(
    list.map(async (shot) => {
      const dir = await loadDirection(shot);
      const takeId = dir.take ?? shot.take;
      let take = takeId ? await loadTake(takeId) : null;
      if (take && dir.mergeTakes?.length) {
        const extra = (await Promise.all(dir.mergeTakes.map(loadTake))).filter((x): x is Take => !!x);
        take = mergeTakes([take, ...extra]);
      }
      const map = dir.events?.at?.length ? new TimeMap(dir.events.at) : take ? new TimeMap([[0, 0], [shot.beats, take.end]]) : null;
      return { shot, dir, take, map, at: Math.round((shot.start - origin) * 1000), durMs: Math.round(shot.dur * 1000) };
    }),
  );
}

// ---------- maker icons ----------

const makerOk = new Map<string, boolean>();

/** Checks which maker icons exist (apps/web/public/makers/<id>.svg); missing ones draw a neutral glyph. */
export async function checkMakers(events: HarnessEvent[]): Promise<void> {
  const ids = new Set<string>();
  for (const e of events) if (e.type === "node.spawn" && e.maker) ids.add(e.maker);
  await Promise.all(
    [...ids].filter((id) => !makerOk.has(id)).map(async (id) => {
      const r = await fetch(`/makers/${encodeURIComponent(id)}.svg`, { method: "GET" });
      makerOk.set(id, r.ok && (r.headers.get("content-type") ?? "").includes("svg"));
    }),
  );
}
export const makerIcon = (id: string): string | null => (makerOk.get(id) ? `/makers/${encodeURIComponent(id)}.svg` : null);

// ---------- preloading ----------

/** Resolves an artifact uri against the take's folder. */
export const artifactUrl = (base: string, uri: string): string =>
  uri.startsWith("/") || uri.includes("://") ? uri : base + uri;

const IMG = /\.(png|jpe?g|webp|svg|gif)$/i;

export async function preloadTake(take: Take): Promise<void> {
  const urls = new Set<string>();
  const add = (u: unknown) => {
    if (typeof u === "string" && IMG.test(u)) urls.add(artifactUrl(take.base, u));
  };
  for (const e of take.events) {
    if (e.type === "node.evidence") {
      add(e.uri);
      add(e.thumb);
      const m = e.meta ?? {};
      for (const k of ["frames", "pages", "images"]) if (Array.isArray(m[k])) (m[k] as unknown[]).forEach(add);
      add(m.shot);
      add(m.before);
    }
  }
  await Promise.all([...urls].map(preloadImage));
  await checkMakers(take.events);
}

const imgCache = new Map<string, Promise<void>>();
export function preloadImage(url: string): Promise<void> {
  if (!imgCache.has(url)) {
    imgCache.set(
      url,
      new Promise<void>((res) => {
        const im = new Image();
        im.onload = () => im.decode().then(() => res(), () => res());
        im.onerror = () => res();
        im.src = url;
      }),
    );
  }
  return imgCache.get(url)!;
}
