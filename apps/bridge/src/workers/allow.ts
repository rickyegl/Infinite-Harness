// Turns a module's `allow` block into Grants. Anything not listed is denied; the adapters translate
// Grants into the CLI's own permission settings, never into prompt wording.

import type { ModuleManifest } from "@harness/protocol";
import { abs, isPlaceholder, repoRoot, type HarnessConfig } from "../config.ts";
import { HARNESS_TOOLS, type Grants } from "./types.ts";

export function resolveGrants(
  allow: ModuleManifest["allow"],
  where: { runDir: string; nodeDir: string },
  cfg: Pick<HarnessConfig, "paths">,
): Grants {
  const g: Grants = { harness: [], servers: {}, shell: false, web: false, writeDirs: [], network: [...(allow.network ?? [])] };
  const harness = new Set<string>();
  for (const t of allow.tools ?? []) {
    if (t === "shell") g.shell = true;
    else if (t === "web") g.web = true;
    else {
      const [server, tool] = t.split(".");
      if (server === "harness") {
        if (tool === "*") g.harness = "*";
        else if ((HARNESS_TOOLS as readonly string[]).includes(tool)) harness.add(tool);
      } else {
        const cur = g.servers[server];
        if (tool === "*" || cur === "*") g.servers[server] = "*";
        else g.servers[server] = [...(cur ?? []), tool];
      }
    }
  }
  if (g.harness !== "*") g.harness = [...harness];
  for (const w of allow.write ?? []) {
    if (w === "$RUN") g.writeDirs.push(where.runDir);
    else if (w === "$NODE") g.writeDirs.push(where.nodeDir);
    else if (w.startsWith("$paths.")) {
      const p = cfg.paths[w.slice(7)];
      if (!p || isPlaceholder(p)) throw new Error(`allow.write ${w}: config paths.${w.slice(7)} is not set`);
      g.writeDirs.push(abs(p));
    } else g.writeDirs.push(abs(w, repoRoot));
  }
  return g;
}

export const harnessToolList = (g: Grants): string[] => (g.harness === "*" ? [...HARNESS_TOOLS] : g.harness);
export const anyNetwork = (g: Grants): boolean => g.network.includes("*");
