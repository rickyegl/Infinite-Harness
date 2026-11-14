// Live mode's link to the bridge: the address and pairing token (kept in this browser), the HTTP calls,
// and the event subscription. Artifact URLs carry the token as a /t/<token>/ path prefix so <img> works.

import type { HarnessEvent } from "@harness/protocol";

export type BridgeSettings = { address: string; token: string };
const KEY = "harness.bridge";
const DEFAULT: BridgeSettings = { address: "http://127.0.0.1:7411", token: "" };

export function loadSettings(): BridgeSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.address === "string" && typeof s.token === "string") return s;
  } catch {
    /* storage blocked or empty */
  }
  return { ...DEFAULT };
}
export function saveSettings(s: BridgeSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: settings last for this page only */
  }
}

/** `?pair=<token>[&bridge=<https address>]` (printed by the bridge on the author's terminal) stores the token (and the bridge's address) and leaves the URL. */
export function takePairing(): void {
  const q = new URLSearchParams(location.search);
  const t = q.get("pair");
  if (!t) return;
  // &bridge=<address>: the bridge's tunnel, for the deployed site on another device
  const address = q.get("bridge");
  saveSettings({ ...loadSettings(), token: t, ...(address && /^https:\/\//.test(address) ? { address } : {}) });
  q.delete("pair");
  q.delete("bridge");
  history.replaceState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}`);
}

const base = (s: BridgeSettings) => s.address.replace(/\/+$/, "");

export async function api<T>(s: BridgeSettings, path: string, body?: unknown): Promise<T> {
  const r = await fetch(base(s) + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${s.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `bridge answered ${r.status}`);
  return j as T;
}

export type RunMeta = { id: string; prompt: string; startedAt: number; state: string };
export type ProxyStatus = { up: boolean; connected: boolean; models: number };

/** Base URL that a run's artifact uris resolve against. */
export const artifactBase = (s: BridgeSettings, run: string) => `${base(s)}/t/${encodeURIComponent(s.token)}/runs/${run}/`;

/**
 * Follows a run: every event from seq 0, then live. Reconnects with the last seq it has, so a dropped
 * socket never loses or repeats an event. Returns a function that stops it.
 */
export function follow(s: BridgeSettings, run: string, onEvent: (e: HarnessEvent) => void, onStatus: (up: boolean) => void): () => void {
  let last = 0;
  let ws: WebSocket | null = null;
  let stopped = false;
  let retry = 0;
  const open = () => {
    const url = `${base(s).replace(/^http/, "ws")}/runs/${run}/events?seq=${last}&token=${encodeURIComponent(s.token)}`;
    ws = new WebSocket(url);
    ws.onopen = () => onStatus(true);
    ws.onmessage = (m) => {
      const e = JSON.parse(String(m.data)) as HarnessEvent;
      if (e.seq <= last) return;
      last = e.seq;
      onEvent(e);
    };
    ws.onclose = () => {
      onStatus(false);
      // reconnecting is plumbing, not a visual: nothing on screen is driven by this timer
      if (!stopped) retry = window.setTimeout(open, 1000);
    };
  };
  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    ws?.close();
  };
}

/** Browser speech recognition, where the browser has it. */
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null };
export function speech(): (new () => Recognition) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}
