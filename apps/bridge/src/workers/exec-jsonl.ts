// Adapter for a CLI with `exec --json` (JSONL items: agent_message, command_execution, file_change,
// mcp_tool_call, web_search; turn.completed / turn.failed). Verified flags are in plan/LOCAL.md.
//
// Enforcement, all through the CLI's own settings:
// - the user config is not loaded at all (--ignore-user-config): no MCP server, plugin or app reaches the
//   worker unless the module's allow block names it; named servers are copied from `<cmd> mcp get --json`,
//   with `enabled_tools` when only some tools are allowed
// - writes: workspace-write sandbox on the working folder plus allow.write folders (--add-dir); temp
//   folders excluded
// - no "shell" in allow.tools: the shell and exec tools are switched off, so the worker cannot run a
//   command at all (this machine's sandbox does not block the network for commands, so a worker with a
//   shell can reach any host; modules.ts therefore makes "shell" require network ["*"])
// - no "web": web search off. Browser, computer use, image generation, sub-agents: always off
// - project instruction files are not loaded (project_doc_max_bytes=0), so the repo's own agent rules
//   never leak into a worker that runs inside runs/

import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { anyNetwork, harnessToolList } from "./allow.ts";
import { runLines, runText, short } from "./proc.ts";
import type { WorkerCall, WorkerOutcome } from "./types.ts";

const ALWAYS_OFF = ["browser_use", "browser_use_external", "in_app_browser", "computer_use", "apps", "plugins", "image_generation", "multi_agent"];

const toml = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(toml).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}=${toml(x)}`).join(",")}}`;
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
};

type ServerDef = { command: string; args: string[]; env: Record<string, string>; cwd?: string | null };

/** Reads one MCP server's definition from the CLI's own config. */
export async function serverDef(cmd: string, name: string): Promise<ServerDef> {
  const r = await runText(cmd, ["mcp", "get", name, "--json"], { timeoutMs: 20_000 });
  if (r.code !== 0) throw new Error(`MCP server "${name}" is not in the worker's config`);
  const j = JSON.parse(r.stdout);
  const t = j.transport ?? {};
  if (t.type !== "stdio") throw new Error(`MCP server "${name}": only stdio servers can be passed through`);
  return { command: t.command, args: t.args ?? [], env: t.env ?? {}, cwd: t.cwd };
}

export async function buildArgs(call: WorkerCall, schemaFile?: string): Promise<string[]> {
  const { grants: g, cfg } = call;
  const a: string[] = ["exec", ...cfg.args, "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config"];
  const c = (k: string, v: unknown) => a.push("-c", `${k}=${toml(v)}`);
  c("project_doc_max_bytes", 0);
  c("web_search", g.web ? "live" : "disabled");
  for (const f of ALWAYS_OFF) a.push("--disable", f);
  if (!g.shell) a.push("--disable", "shell_tool", "--disable", "unified_exec");
  a.push("-s", "workspace-write", "-C", call.cwd);
  c("sandbox_workspace_write.network_access", g.shell && anyNetwork(g));
  c("sandbox_workspace_write.exclude_tmpdir_env_var", true);
  c("sandbox_workspace_write.exclude_slash_tmp", true);
  for (const d of g.writeDirs) a.push("--add-dir", d);
  if (cfg.model && !/^<.*>$/.test(cfg.model)) a.push("-m", cfg.model);
  if (cfg.effort) c("model_reasoning_effort", cfg.effort);
  if (schemaFile) a.push("--output-schema", schemaFile);

  const tools = harnessToolList(g);
  if (call.harnessMcp && tools.length) {
    const p = "mcp_servers.harness";
    c(`${p}.command`, call.harnessMcp.command);
    c(`${p}.args`, call.harnessMcp.args);
    c(`${p}.env`, call.harnessMcp.env);
    c(`${p}.enabled_tools`, tools);
    c(`${p}.tool_timeout_sec`, 4 * 3600);
    c(`${p}.startup_timeout_sec`, 60);
    c(`${p}.default_tools_approval_mode`, "approve");
  }
  for (const [name, which] of Object.entries(g.servers)) {
    const def = await serverDef(cfg.cmd, name);
    const p = `mcp_servers.${JSON.stringify(name)}`;
    c(`${p}.command`, def.command);
    c(`${p}.args`, def.args);
    if (Object.keys(def.env).length) c(`${p}.env`, def.env);
    if (def.cwd) c(`${p}.cwd`, def.cwd);
    if (which !== "*") c(`${p}.enabled_tools`, which);
    c(`${p}.tool_timeout_sec`, 600);
    c(`${p}.default_tools_approval_mode`, "approve");
  }
  a.push("-"); // prompt on stdin: no Windows argument quoting to get wrong
  return a;
}

export async function runExecJsonl(call: WorkerCall): Promise<WorkerOutcome> {
  let schemaFile: string | undefined;
  if (call.schema) {
    schemaFile = join(call.cwd, ".answer-schema.json");
    writeFileSync(schemaFile, JSON.stringify(call.schema));
  }
  const args = await buildArgs(call, schemaFile);
  const files = new Set<string>();
  let text = "";
  let error: string | undefined;
  const res = await runLines(call.cfg.cmd, args, {
    cwd: call.cwd,
    stdin: call.prompt,
    timeoutMs: call.timeoutMs,
    signal: call.signal,
    onLine: (line) => {
      call.onRaw?.(line);
      let e: any;
      try {
        e = JSON.parse(line);
      } catch {
        return;
      }
      const it = e.item;
      if (e.type === "item.started" && it?.type === "command_execution") call.onStep("Ran a command", short(String(it.command ?? "")), "code");
      else if (e.type === "item.started" && it?.type === "mcp_tool_call" && it.server !== "harness") call.onStep(`${it.server}: ${it.tool}`, short(JSON.stringify(it.arguments ?? {})), "cog");
      else if (e.type === "item.started" && it?.type === "web_search") call.onStep("Searched the web", short(String(it.query ?? "")), "globe");
      else if (e.type === "item.completed" && it?.type === "file_change") {
        for (const ch of it.changes ?? []) {
          if (!ch?.path || files.has(ch.path)) continue;
          files.add(ch.path);
          call.onFile(ch.path);
          call.onStep(ch.kind === "add" ? `Wrote ${basename(ch.path)}` : `Edited ${basename(ch.path)}`, undefined, "pencil");
        }
      } else if (e.type === "item.completed" && it?.type === "agent_message") text = String(it.text ?? "");
      else if (e.type === "item.completed" && it?.type === "mcp_tool_call" && it.error) call.onStep(`${it.server}: ${it.tool} failed`, short(String(it.error?.message ?? it.error)), "alert");
      else if (e.type === "turn.failed") error = String(e.error?.message ?? "turn failed");
      else if (e.type === "error" && !error) error = String(e.message ?? "error");
    },
  });
  if (res.killed && !error) error = call.signal.aborted ? "cancelled" : "timed out";
  if (res.code !== 0 && !error) error = `worker exited with ${res.code}: ${short(res.stderr, 400)}`;
  const out: WorkerOutcome = { ok: !error, text, files: [...files], error };
  if (call.schema && text) {
    try {
      out.json = JSON.parse(text);
    } catch {
      out.ok = false;
      out.error ??= "final answer is not JSON";
    }
  }
  return out;
}
