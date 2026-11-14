// Processes the harness started and that outlive the call that started them: tunnels, editors it opened.
// Kept in runs/.procs.json so `pnpm stop` can close exactly these (by recorded pid, never by image name: the
// author may run the same programs for their own work) after the bridge is gone.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { abs, config } from "./config.ts";

export type ProcKind = "tunnel" | "editor";
export type ProcEntry = { pid: number; kind: ProcKind; what: string; run?: string; url?: string; startedAt: number };

export const procsFile = (runsDir = abs(config().bridge.runsDir)) => join(runsDir, ".procs.json");

export function readProcs(file = procsFile()): ProcEntry[] {
  try {
    const v = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: ProcEntry[], file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
}

export function addProc(e: ProcEntry, file = procsFile()): void {
  write([...readProcs(file).filter((p) => p.pid !== e.pid), e], file);
}

export function dropProc(pid: number, file = procsFile()): void {
  write(readProcs(file).filter((p) => p.pid !== pid), file);
}

/** true while a process with this pid runs (and, on Windows, has the expected image name when given) */
export function alive(pid: number, image?: string): boolean {
  if (process.platform === "win32") {
    const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
    const line = (r.stdout ?? "").trim();
    if (!line || line.startsWith("INFO")) return false;
    return !image || line.toLowerCase().startsWith(`"${image.toLowerCase()}"`);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** ends a process and its children */
export function killTree(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
  else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}
