// Spawning a CLI and reading its JSON event stream line by line, with a timeout and abort.

import { spawn } from "node:child_process";

export type ProcResult = { code: number; stderr: string; killed: boolean };

export function runLines(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: NodeJS.ProcessEnv; stdin?: string; timeoutMs: number; signal: AbortSignal; onLine: (line: string) => void },
): Promise<ProcResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    let stderr = "";
    let killed = false;
    const kill = () => {
      if (killed) return;
      killed = true;
      // the CLIs start their own children (MCP servers, shells): take the whole tree down
      if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      else child.kill("SIGTERM");
    };
    const timer = setTimeout(kill, opts.timeoutMs);
    const onAbort = () => kill();
    opts.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) opts.onLine(line);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      stderr = (stderr + d).slice(-20_000);
    });
    child.on("error", (e) => {
      stderr += `\n${e.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal.removeEventListener("abort", onAbort);
      if (buf.trim()) opts.onLine(buf.trim());
      resolve({ code: code ?? -1, stderr, killed });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(opts.stdin ?? "");
  });
}

/** Runs a command to completion and returns its output (for short helper calls). */
export function runText(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ? { ...process.env, ...opts.env } : process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), opts.timeoutMs ?? 30_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => (stderr += e.message));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export const short = (s: string, n = 140): string => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
};
