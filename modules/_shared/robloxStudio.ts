// A small client for Roblox Studio's own MCP server (stdio, newline-delimited JSON-RPC), so a script cell can
// change the open place (write a config module, run a play test, read the console) without a worker.
// The launcher is config `paths.robloxMcp` (a command line), default: Studio's own mcp.bat in %LOCALAPPDATA%\Roblox.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

export class StudioMcp {
  private proc: ChildProcess | null = null;
  private next = 1;
  private pending = new Map<number, Pending>();
  private buf = "";

  constructor(private launcher = defaultLauncher()) {}

  static available(launcher = defaultLauncher()): boolean {
    return !!launcher && (process.platform !== "win32" || existsSync(launcher.bat));
  }

  async open(): Promise<void> {
    if (this.proc) return;
    const l = this.launcher;
    if (!l) throw new Error("Roblox Studio's MCP launcher was not found");
    const p = spawn("cmd.exe", ["/d", "/c", l.bat], { cwd: l.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.proc = p;
    p.stdout!.on("data", (d: Buffer) => this.onData(d));
    p.stderr!.on("data", () => {});
    p.on("exit", () => {
      for (const q of this.pending.values()) q.reject(new Error("Studio's MCP server exited"));
      this.pending.clear();
      this.proc = null;
    });
    await this.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "harness", version: "1" } }, 30_000);
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  private onData(d: Buffer) {
    this.buf += d.toString("utf8");
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line.startsWith("{")) continue;
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      const q = typeof m.id === "number" ? this.pending.get(m.id) : undefined;
      if (!q) continue;
      this.pending.delete(m.id);
      clearTimeout(q.timer);
      if (m.error) q.reject(new Error(m.error.message ?? "Studio MCP error"));
      else q.resolve(m.result);
    }
  }

  private send(m: object) {
    this.proc!.stdin!.write(JSON.stringify(m) + "\n");
  }

  private rpc(method: string, params: object, timeoutMs = 60_000): Promise<any> {
    if (!this.proc) return Promise.reject(new Error("not open"));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Studio MCP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** calls a tool; returns its text content (throws when the tool reports an error) */
  async call(name: string, args: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<string> {
    await this.open();
    const r = await this.rpc("tools/call", { name, arguments: args }, timeoutMs);
    const text = (r?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    if (r?.isError) throw new Error(text || `${name} failed`);
    return text;
  }

  /** the raw content list of a tool call (images come back as base64 `data`) */
  async content(name: string, args: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<{ type: string; text?: string; data?: string; mimeType?: string }[]> {
    await this.open();
    const r = await this.rpc("tools/call", { name, arguments: args }, timeoutMs);
    if (r?.isError) throw new Error((r.content ?? []).map((c: any) => c.text ?? "").join(" ") || `${name} failed`);
    return r?.content ?? [];
  }

  close(): void {
    if (!this.proc) return;
    const pid = this.proc.pid;
    this.proc.stdin?.end();
    if (pid && process.platform === "win32") spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    else this.proc.kill();
    this.proc = null;
  }
}

function defaultLauncher(): { bat: string; cwd: string } | null {
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Roblox") : "";
  return base ? { bat: join(base, "mcp.bat"), cwd: base } : null;
}

/** a Luau string literal for any text */
export const luaString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;

// ------------------------------------------------------------------ the harness's own place

export type Studio = { mcp: StudioMcp; id: string; name: string };

/**
 * Connects to the open Studio whose place name contains `placeName` (config `roblox.studioPlace`). Only that
 * window is ever changed: the author may have other places open. Returns null when it is not open.
 */
export async function harnessStudio(placeName: string): Promise<Studio | null> {
  if (!placeName || !StudioMcp.available()) return null;
  const mcp = new StudioMcp();
  try {
    const list = JSON.parse(await mcp.call("list_roblox_studios", {}, 30_000)) as { studios?: { id: string; name: string }[] };
    const s = (list.studios ?? []).find((x) => x.name.toLowerCase().includes(placeName.toLowerCase()));
    if (!s) {
      mcp.close();
      return null;
    }
    return { mcp, id: s.id, name: s.name };
  } catch {
    mcp.close();
    return null;
  }
}

/** runs Luau in the edit (or play) data model of that Studio; returns what it printed or returned */
export const luau = (s: Studio, code: string, dm: "Edit" | "Server" | "Client" = "Edit") =>
  s.mcp.call("execute_luau", { studio_id: s.id, code, datamodel_type: dm }, 60_000);

/** replaces (or creates) ReplicatedStorage.Shared.<name> with `source`, and switches HTTP requests on */
export async function writeSharedModule(s: Studio, name: string, source: string): Promise<string> {
  return luau(
    s,
    [
      `local rs = game:GetService("ReplicatedStorage")`,
      `local shared = rs:FindFirstChild("Shared") or Instance.new("Folder")`,
      `shared.Name = "Shared"`,
      `shared.Parent = rs`,
      `local m = shared:FindFirstChild(${luaString(name)}) or Instance.new("ModuleScript")`,
      `m.Name = ${luaString(name)}`,
      `m.Source = ${luaString(source)}`,
      `m.Parent = shared`,
      `local http = pcall(function() game:GetService("HttpService").HttpEnabled = true end)`,
      `return "written " .. m:GetFullName() .. (http and ", HTTP on" or ", HTTP setting left as it is")`,
    ].join("\n"),
  );
}

export type PlayTest = { seconds: number; errors: string[]; frames: Buffer[]; log: string };

/**
 * Presses Play, waits, captures `frames` screenshots across the test, reads the output log and stops again.
 * Script errors are the log lines Studio prints in red (error / stack begin lines).
 */
export async function playTest(s: Studio, seconds = 5, frames = 4): Promise<PlayTest> {
  const before = await s.mcp.call("get_console_output", { studio_id: s.id }, 30_000).catch(() => "");
  await s.mcp.call("start_stop_play", { studio_id: s.id, is_start: true }, 60_000);
  const shots: Buffer[] = [];
  const t0 = Date.now();
  try {
    for (let k = 0; k < frames; k++) {
      await new Promise((r) => setTimeout(r, (seconds * 1000) / frames));
      const c = await s.mcp.content("screen_capture", { studio_id: s.id, capture_id: `HarnessPlay_${k + 1}` }, 30_000).catch(() => []);
      const img = c.find((x) => x.type === "image" && x.data);
      if (img?.data) shots.push(Buffer.from(img.data, "base64"));
    }
  } finally {
    await s.mcp.call("start_stop_play", { studio_id: s.id, is_start: false }, 60_000).catch(() => "");
  }
  const after = await s.mcp.call("get_console_output", { studio_id: s.id }, 30_000).catch(() => "");
  const log = after.startsWith(before) ? after.slice(before.length) : after;
  const errors = log.split(/\r?\n/).filter((l) => /\berror\b|Stack Begin|attempt to|is not a valid member/i.test(l) && !/^\s*$/.test(l)).slice(0, 20);
  return { seconds: (Date.now() - t0) / 1000, errors, frames: shots, log };
}
