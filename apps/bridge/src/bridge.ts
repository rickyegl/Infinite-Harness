// Wires config, run store, modules, runner and server together (main.ts and the tests use this).

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { abs, type HarnessConfig } from "./config.ts";
import { loadModules, type LoadedModule } from "./modules.ts";
import { Runner } from "./runner.ts";
import { startServer } from "./server.ts";
import { RunStore } from "./store.ts";
import { exePath, tunnels } from "./tunnels.ts";
import { procsFile } from "./procs.ts";

export type Bridge = {
  url: string; token: string; tokenFile: string; store: RunStore; runner: Runner;
  mods: Map<string, LoadedModule>; recovered: string[]; close: () => Promise<void>;
};

/** The pairing token lives in a file next to the runs, made once and reused, so the site stays paired. */
export function pairingToken(file: string): string {
  if (existsSync(file)) {
    const t = readFileSync(file, "utf8").trim();
    if (t.length >= 32) return t;
  }
  const t = randomBytes(24).toString("hex");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, t + "\n", { mode: 0o600 });
  return t;
}

export async function createBridge(cfg: HarnessConfig, opts: { modulesDir?: string } = {}): Promise<Bridge> {
  const store = new RunStore(abs(cfg.bridge.runsDir));
  const recovered = store.recover();
  const tokenFile = abs(cfg.bridge.tokenFile);
  const token = pairingToken(tokenFile);
  const mods = loadModules(opts.modulesDir);
  tunnels.file = procsFile(abs(cfg.bridge.runsDir));
  tunnels.exe = exePath(cfg.paths.cloudflared ?? "cloudflared");
  // the runner needs the server's URL and the server needs the runner: fill the URL in after listen
  const deps = { store, cfg, mods, bridgeUrl: "", tokenFile };
  const runner = new Runner(deps);
  const srv = await startServer({ cfg, store, runner, mods, token });
  deps.bridgeUrl = srv.url;
  return {
    url: srv.url, token, tokenFile, store, runner, mods, recovered,
    close: async () => {
      for (const r of [...runner.runs.values()]) r.cancel();
      // the session ends: every tunnel it opened goes with it
      tunnels.closeAll();
      await srv.close();
    },
  };
}
