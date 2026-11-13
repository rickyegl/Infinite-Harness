// Crossplay relay: tiny rooms that pass kart states between games.
//   WS   /relay/<room>                 browser builds: send a state, receive everyone else's (about 10 Hz)
//   POST /relay/<room> {state}|{states:[...]}  game servers that can only make HTTP requests: send your states,
//                                      get back the latest state of every other sender in the room
//   GET  /relay/<room>?since=N         long-poll (up to 8 s) for messages after N
// A state is a small JSON object with a string `id`; the relay does not read anything else in it.
// No pairing token: games outside this machine reach it through a tunnel. Sizes and rates are capped instead.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

const MAX_MSG = 2048;
const MAX_ROOMS = 32;
const MAX_CLIENTS = 16;
const MAX_RATE = 30; // messages per second per sender connection
const STALE_MS = 5000;
const LOG = 256;
const ROOM = /^\/relay\/([A-Za-z0-9_-]{1,64})$/;

interface Room {
  sockets: Set<WebSocket>;
  last: Map<string, { msg: string; at: number }>;
  log: { seq: number; id: string; msg: string }[];
  seq: number;
  waiters: Set<() => void>;
  touched: number;
}

export function createRelay() {
  const rooms = new Map<string, Room>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG });

  const room = (name: string): Room | null => {
    let r = rooms.get(name);
    if (!r) {
      for (const [k, v] of rooms) if (v.sockets.size === 0 && Date.now() - v.touched > 60_000) rooms.delete(k);
      if (rooms.size >= MAX_ROOMS) return null;
      r = { sockets: new Set(), last: new Map(), log: [], seq: 0, waiters: new Set(), touched: Date.now() };
      rooms.set(name, r);
    }
    r.touched = Date.now();
    return r;
  };

  /** validates one state; returns its sender id and the canonical text, or null */
  const parse = (raw: unknown): { id: string; msg: string } | null => {
    const v = typeof raw === "string" ? safeJson(raw) : raw;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const id = (v as { id?: unknown }).id;
    if (typeof id !== "string" || !id || id.length > 64) return null;
    const msg = JSON.stringify(v);
    return msg.length > MAX_MSG ? null : { id, msg };
  };

  const publish = (r: Room, from: WebSocket | null, s: { id: string; msg: string }) => {
    r.last.set(s.id, { msg: s.msg, at: Date.now() });
    r.log.push({ seq: ++r.seq, id: s.id, msg: s.msg });
    if (r.log.length > LOG) r.log.splice(0, r.log.length - LOG);
    for (const ws of r.sockets) if (ws !== from && ws.readyState === ws.OPEN) ws.send(s.msg);
    for (const w of r.waiters) w();
    r.waiters.clear();
  };

  const others = (r: Room, mine: Set<string>) => {
    const now = Date.now();
    const out: unknown[] = [];
    for (const [id, v] of r.last) {
      if (now - v.at > STALE_MS) r.last.delete(id);
      else if (!mine.has(id)) out.push(JSON.parse(v.msg));
    }
    return out;
  };

  /** handles /relay requests; returns false when the path is not a relay path */
  const http = async (req: IncomingMessage, res: ServerResponse, path: string, url: URL): Promise<boolean> => {
    const m = ROOM.exec(path);
    if (!m) return false;
    const send = (code: number, v: unknown) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(v));
    };
    const r = room(m[1]);
    if (!r) return send(503, { error: "too many rooms" }), true;
    if (req.method === "POST") {
      const text = await readBody(req, MAX_MSG * 8);
      const b = text === null ? null : safeJson(text);
      if (!b || typeof b !== "object") return send(400, { error: "body must be a JSON state or {states:[...]}" }), true;
      const list = Array.isArray((b as { states?: unknown }).states) ? ((b as { states: unknown[] }).states).slice(0, 8) : [b];
      const mine = new Set<string>();
      for (const s of list) {
        const p = parse(s);
        if (p) {
          mine.add(p.id);
          publish(r, null, p);
        }
      }
      return send(200, { seq: r.seq, states: others(r, mine) }), true;
    }
    if (req.method === "GET") {
      const since = Number(url.searchParams.get("since") ?? 0) || 0;
      const pick = () => r.log.filter((e) => e.seq > since).map((e) => JSON.parse(e.msg));
      if (r.seq <= since) {
        await new Promise<void>((done) => {
          const t = setTimeout(() => (r.waiters.delete(wake), done()), 8000);
          const wake = () => (clearTimeout(t), done());
          r.waiters.add(wake);
          req.on("close", wake);
        });
      }
      return send(200, { seq: r.seq, msgs: pick() }), true;
    }
    return send(405, { error: "GET or POST" }), true;
  };

  const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer, path: string): boolean => {
    const m = ROOM.exec(path);
    if (!m) return false;
    const r = room(m[1]);
    if (!r || r.sockets.size >= MAX_CLIENTS) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return true;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      r.sockets.add(ws);
      // the newcomer sees everyone at once
      for (const s of others(r, new Set())) ws.send(JSON.stringify(s));
      let windowStart = Date.now();
      let count = 0;
      ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        const now = Date.now();
        if (now - windowStart > 1000) (windowStart = now), (count = 0);
        if (++count > MAX_RATE) return;
        const p = parse(data.toString());
        if (p) publish(r, ws, p);
      });
      ws.on("close", () => r.sockets.delete(ws));
      ws.on("error", () => r.sockets.delete(ws));
    });
    return true;
  };

  const close = () => {
    for (const r of rooms.values()) for (const ws of r.sockets) ws.terminate();
    rooms.clear();
  };

  return { http, upgrade, close, rooms };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  return new Promise((resolve) => {
    let s = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      s += c;
      if (s.length > max) {
        resolve(null);
        req.destroy();
      }
    });
    req.on("end", () => resolve(s));
    req.on("error", () => resolve(null));
  });
}
