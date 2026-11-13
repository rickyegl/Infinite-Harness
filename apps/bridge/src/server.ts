// HTTP + WebSocket on 127.0.0.1. Every request carries the pairing token: `Authorization: Bearer <token>`,
// `?token=<token>`, or a `/t/<token>/` path prefix (used for artifact URLs, so <img src> works).
//
//   POST /runs {prompt}            -> {id, startedAt}
//   GET  /runs                     -> recent runs (meta)
//   GET  /runs/:id                 -> meta
//   GET  /runs/:id/events?seq=N    -> WebSocket: every event with seq > N, then live; plain GET: jsonl
//   GET  /runs/:id/<path>          -> a file of the run (artifacts/..., meta.json)
//   POST /runs/:id/say {text}      -> follow-up prompt in the same run
//   POST /runs/:id/cancel
//   GET  /modules                  -> installed modules
//   GET  /health
//   GET  /proxy/status             -> {up, connected, models}  (connected = the proxy lists at least one model)
//   GET  /proxy/signin             -> {url} of the proxy's own sign-in page
//   POST /internal/tool            -> harness MCP calls from workers

import { timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { isPlaceholder, type HarnessConfig } from "./config.ts";
import type { LoadedModule } from "./modules.ts";
import type { Runner } from "./runner.ts";
import type { RunLog, RunStore } from "./store.ts";

const TYPES: Record<string, string> = {
  ".json": "application/json", ".jsonl": "application/x-ndjson", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json", ".mp4": "video/mp4", ".webm": "video/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".html": "text/plain; charset=utf-8",
};

export type ServerDeps = { cfg: HarnessConfig; store: RunStore; runner: Runner; mods: Map<string, LoadedModule>; token: string };

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ORIGIN_OK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

export function startServer(d: ServerDeps): Promise<{ url: string; close: () => Promise<void> }> {
  const wss = new WebSocketServer({ noServer: true });

  /** strips a /t/<token>/ prefix; returns the path and whether the request is authorized */
  const auth = (req: IncomingMessage): { path: string; url: URL; ok: boolean } => {
    const url = new URL(req.url ?? "/", "http://x");
    let path = decodeURIComponent(url.pathname);
    let tok = url.searchParams.get("token") ?? "";
    const m = /^\/t\/([^/]+)(\/.*)$/.exec(path);
    if (m) {
      tok = m[1];
      path = m[2];
    }
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) tok = h.slice(7);
    return { path, url, ok: !!tok && sameToken(tok, d.token) };
  };

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    const o = req.headers.origin;
    if (o && ORIGIN_OK.test(o)) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
  };
  const json = (res: ServerResponse, code: number, v: unknown) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(v));
  };
  const body = (req: IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      let s = "";
      req.setEncoding("utf8");
      req.on("data", (c) => {
        s += c;
        if (s.length > 2_000_000) reject(new Error("body too large"));
      });
      req.on("end", () => {
        try {
          resolve(s ? JSON.parse(s) : {});
        } catch {
          reject(new Error("body is not JSON"));
        }
      });
    });

  const proxyStatus = async () => {
    const p = d.cfg.proxy;
    const key = process.env[p.apiKeyEnv];
    try {
      const r = await fetch(`${p.baseUrl}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(4000) });
      if (!r.ok) return { up: true, connected: false, models: 0, status: r.status };
      const j = (await r.json()) as { data?: unknown[] };
      const n = Array.isArray(j.data) ? j.data.length : 0;
      return { up: true, connected: n > 0, models: n };
    } catch {
      return { up: false, connected: false, models: 0 };
    }
  };

  const server = createServer(async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.end();
    const { path, url, ok } = auth(req);
    if (!ok) return json(res, 401, { error: "pairing token missing or wrong" });
    const parts = path.split("/").filter(Boolean);
    try {
      if (req.method === "GET" && path === "/health") {
        return json(res, 200, { ok: true, mock: d.cfg.mock.enabled, active: [...d.runner.runs.keys()], modules: d.mods.size });
      }
      if (req.method === "GET" && path === "/modules") {
        return json(res, 200, [...d.mods.values()].map((m) => ({ ...m.manifest, hasRun: m.hasRun, fixtures: m.fixtures.length })));
      }
      if (req.method === "GET" && path === "/proxy/status") return json(res, 200, await proxyStatus());
      if (req.method === "GET" && path === "/proxy/signin") {
        const u = d.cfg.proxy.signInUrl;
        return json(res, isPlaceholder(u) ? 404 : 200, isPlaceholder(u) ? { error: "proxy.signInUrl is not set" } : { url: u });
      }
      if (req.method === "POST" && path === "/internal/tool") {
        const b = await body(req);
        try {
          const result = await d.runner.tool(String(b.run), String(b.node), String(b.tool), (b.args ?? {}) as Record<string, unknown>);
          return json(res, 200, { result });
        } catch (e) {
          return json(res, 200, { error: (e as Error).message });
        }
      }
      if (parts[0] === "runs") {
        if (parts.length === 1 && req.method === "POST") {
          const b = await body(req);
          const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
          if (!prompt) return json(res, 400, { error: "prompt is required" });
          const r = d.runner.start(prompt);
          return json(res, 200, { id: r.id, startedAt: r.log.meta.startedAt });
        }
        if (parts.length === 1 && req.method === "GET") return json(res, 200, d.store.list().slice(0, 50));
        const id = parts[1];
        if (!/^[A-Za-z0-9_-]+$/.test(id) || !d.store.meta(id)) return json(res, 404, { error: `no run ${id}` });
        if (parts.length === 2 && req.method === "GET") return json(res, 200, d.store.meta(id));
        if (parts[2] === "say" && req.method === "POST") {
          const b = await body(req);
          const text = typeof b.text === "string" ? b.text.trim() : "";
          if (!text) return json(res, 400, { error: "text is required" });
          d.runner.say(id, text);
          return json(res, 200, { ok: true });
        }
        if (parts[2] === "cancel" && req.method === "POST") return json(res, 200, { ok: d.runner.cancel(id) });
        if (parts[2] === "events" && parts.length === 3 && req.method === "GET") {
          const since = Number(url.searchParams.get("seq") ?? 0);
          const evs = (d.runner.runs.get(id)?.log.events ?? d.store.events(id)).filter((e) => e.seq > since);
          res.setHeader("Content-Type", "application/x-ndjson");
          return res.end(evs.map((e) => JSON.stringify(e)).join("\n") + (evs.length ? "\n" : ""));
        }
        if (req.method === "GET") {
          const root = d.store.dir(id);
          const file = normalize(join(root, ...parts.slice(2)));
          if (!file.startsWith(root + sep) || parts.slice(2).some((p) => p.startsWith("."))) return json(res, 403, { error: "forbidden" });
          if (!existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: "not found" });
          res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache");
          return createReadStream(file).pipe(res);
        }
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const { path, url, ok } = auth(req);
    const m = /^\/runs\/([A-Za-z0-9_-]+)\/events$/.exec(path);
    const o = req.headers.origin;
    if (!ok || !m || (o && !ORIGIN_OK.test(o)) || !d.store.meta(m[1])) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => subscribe(ws, m[1], Number(url.searchParams.get("seq") ?? 0)));
  });

  /** replay every event after `since`, then stream new ones; no gap and no duplicate. A finished run that
   *  /say reopens gets a new log: the watcher re-attaches to it. */
  const subscribe = (ws: WebSocket, id: string, since: number) => {
    let last = since;
    let cur: RunLog | null = null;
    let off = () => {};
    const send = (e: { seq: number }) => {
      if (e.seq <= last) return;
      last = e.seq;
      ws.send(JSON.stringify(e));
    };
    const check = () => {
      const r = d.runner.runs.get(id);
      if (!r || r.log === cur) return;
      off();
      cur = r.log;
      off = r.log.subscribe(send);
      for (const e of r.log.events) send(e);
    };
    if (!d.runner.runs.get(id)) for (const e of d.store.events(id)) send(e);
    check();
    const timer = setInterval(check, 500);
    ws.on("close", () => {
      clearInterval(timer);
      off();
    });
  };

  return new Promise((resolve) => {
    server.listen(d.cfg.bridge.port, d.cfg.bridge.host, () => {
      const a = server.address();
      const port = typeof a === "object" && a ? a.port : d.cfg.bridge.port;
      resolve({
        url: `http://${d.cfg.bridge.host}:${port}`,
        close: () => new Promise((r) => {
          for (const c of wss.clients) c.terminate();
          server.close(() => r());
          server.closeAllConnections();
        }),
      });
    });
  });
}
