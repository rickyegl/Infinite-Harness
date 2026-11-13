// Adapter for a CLI with `-p --output-format stream-json` (events: system/init, assistant messages whose
// content holds tool_use blocks, user messages with tool_result, and a final `result` with is_error).
//
// Enforcement, all through the CLI's own settings:
// - --strict-mcp-config with --mcp-config: only the harness server and the servers allow.tools names
//   (copied from `workers.<name>.mcpServers` in the local config) are started
// - --restricted: user, project and local settings are not read, code-running and fetch tools are gone
//   unless --tools names them, and file tools stay inside the working folder plus --add-dir folders
// - --tools lists the built-in tools the worker has at all: file tools always, the shell only with
//   "shell", fetch and search only with "web"
// - --allowedTools pre-approves exactly the granted tools; with --permission-prompts none anything else
//   that would need approval is refused, never asked
// Status: written against the CLI's --help; not yet run end to end (see plan/STATUS.md).

import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { harnessToolList } from "./allow.ts";
import { runLines, short } from "./proc.ts";
import type { WorkerCall, WorkerOutcome } from "./types.ts";

const FILE_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "MultiEdit"];
const WRITES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

type McpDef = { command: string; args?: string[]; env?: Record<string, string> };

export function buildArgs(call: WorkerCall, mcpFile: string, schema?: string): string[] {
  const { grants: g, cfg } = call;
  const tools = [...FILE_TOOLS, ...(g.shell ? ["Bash"] : []), ...(g.web ? ["WebFetch", "WebSearch"] : [])];
  const allowed = [...tools];
  for (const t of harnessToolList(g)) allowed.push(`mcp__harness__${t}`);
  for (const [name, which] of Object.entries(g.servers)) {
    if (which === "*") allowed.push(`mcp__${name}`);
    else for (const t of which) allowed.push(`mcp__${name}__${t}`);
  }
  const a = [
    ...cfg.args,
    "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
    "--strict-mcp-config", "--mcp-config", mcpFile,
    "--restricted", "--tools", tools.join(","),
    "--permission-mode", "acceptEdits", "--permission-prompts", "none",
    "--allowedTools", allowed.join(","),
  ];
  for (const d of g.writeDirs) a.push("--add-dir", d);
  if (cfg.model && !/^<.*>$/.test(cfg.model)) a.push("--model", cfg.model);
  if (schema) a.push("--json-schema", schema);
  return a;
}

export async function runStreamJson(call: WorkerCall): Promise<WorkerOutcome> {
  const servers: Record<string, McpDef> = {};
  if (call.harnessMcp && harnessToolList(call.grants).length) servers.harness = call.harnessMcp;
  const defined = (call.cfg as { mcpServers?: Record<string, McpDef> }).mcpServers ?? {};
  for (const name of Object.keys(call.grants.servers)) {
    if (!defined[name]) throw new Error(`MCP server "${name}" is not in workers.${call.name}.mcpServers`);
    servers[name] = defined[name];
  }
  const mcpFile = join(call.cwd, ".mcp-servers.json");
  writeFileSync(mcpFile, JSON.stringify({ mcpServers: servers }));
  const args = buildArgs(call, mcpFile, call.schema ? JSON.stringify(call.schema) : undefined);

  const files = new Set<string>();
  let text = "";
  let json: unknown;
  let error: string | undefined;
  let gotResult = false;
  const res = await runLines(call.cfg.cmd, args, {
    cwd: call.cwd,
    stdin: call.prompt,
    timeoutMs: call.timeoutMs,
    signal: call.signal,
    // long harness calls (spawn_task, request_asset) block until the child is done
    env: { ...process.env, MCP_TOOL_TIMEOUT: String(4 * 3600_000) },
    onLine: (line) => {
      call.onRaw?.(line);
      let e: any;
      try {
        e = JSON.parse(line);
      } catch {
        return;
      }
      if (e.type === "assistant") {
        for (const b of e.message?.content ?? []) {
          if (b?.type !== "tool_use") continue;
          const name = String(b.name ?? "");
          const inp = b.input ?? {};
          if (name.startsWith("mcp__harness__")) continue; // the harness server reports these itself
          if (WRITES.has(name) && inp.file_path) {
            const p = String(inp.file_path);
            if (!files.has(p)) {
              files.add(p);
              call.onFile(p);
            }
            call.onStep(`${name === "Write" ? "Wrote" : "Edited"} ${basename(p)}`, undefined, "pencil");
          } else if (name === "Bash") call.onStep("Ran a command", short(String(inp.command ?? "")), "code");
          else if (name === "WebFetch" || name === "WebSearch") call.onStep(name === "WebFetch" ? "Fetched a page" : "Searched the web", short(String(inp.url ?? inp.query ?? "")), "globe");
          else if (name.startsWith("mcp__")) {
            const [, server, tool] = name.split("__");
            call.onStep(`${server}: ${tool}`, short(JSON.stringify(inp)), "cog");
          } else if (name === "Read") call.onStep(`Read ${basename(String(inp.file_path ?? ""))}`, undefined, "book");
        }
      } else if (e.type === "result") {
        gotResult = true;
        text = typeof e.result === "string" ? e.result : "";
        if (e.structured_output !== undefined) json = e.structured_output;
        if (e.is_error) error = short(text || String(e.subtype ?? "error"), 400);
      }
    },
  });
  if (res.killed && !error) error = call.signal.aborted ? "cancelled" : "timed out";
  if (!gotResult && !error) error = `worker exited with ${res.code} and no result: ${short(res.stderr, 400)}`;
  if (res.code !== 0 && !error) error = `worker exited with ${res.code}`;
  const out: WorkerOutcome = { ok: !error, text, files: [...files], error };
  if (call.schema) {
    if (json === undefined && text) {
      try {
        json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        /* handled below */
      }
    }
    if (json === undefined) {
      out.ok = false;
      out.error ??= "final answer is not JSON";
    } else out.json = json;
  }
  return out;
}
