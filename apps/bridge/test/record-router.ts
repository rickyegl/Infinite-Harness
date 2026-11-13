// pnpm --filter bridge record:router [case-name-filter]: routes every table case for real (proxy first,
// worker fallback) and saves the outputs to apps/bridge/fixtures/router/. The table test then checks the
// saved outputs. Each file says which backend produced it and how long it took.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { abs, config } from "../src/config.ts";
import { loadModules, summaries } from "../src/modules.ts";
import { checkPlan, promptKey, RECORDED, route, type Recorded } from "../src/router.ts";
import { CASES, CATALOG } from "./router-cases.ts";

const cfg = config();
const filter = process.argv[2]?.toLowerCase();
const installed = summaries(loadModules().values());
const cases = CASES.filter((c) => !filter || c.name.toLowerCase().includes(filter));
mkdirSync(RECORDED, { recursive: true });
const work = join(abs(cfg.bridge.runsDir), ".router");

let i = 0;
const next = async (): Promise<void> => {
  const c = cases[i++];
  if (!c) return;
  const catalog = c.catalog === "installed" ? installed : CATALOG;
  try {
    const r = await route(cfg, c.prompt, catalog, { existing: c.existing, workDir: join(work, String(i)) });
    const rec: Recorded = {
      prompt: c.prompt, existing: c.existing, catalog: catalog.map((m) => m.id), backend: r.backend as "proxy" | "worker",
      modelKey: r.backend === "proxy" ? "proxy.routerModel" : `workers.${cfg.router.worker}`, ms: r.ms,
      recordedAt: new Date().toISOString(), plan: r.plan,
    };
    writeFileSync(join(RECORDED, `${promptKey(c.prompt, c.existing)}.json`), JSON.stringify(rec, null, 2) + "\n");
    const bad = checkPlan(r.plan, catalog.map((m) => m.id), c.existing);
    console.log(`${c.name}: ${r.backend} ${r.ms} ms -> ${r.plan.nodes.map((n) => n.module).join(", ")}${bad ? ` (INVALID: ${bad})` : ""}`);
  } catch (e) {
    console.log(`${c.name}: FAILED ${(e as Error).message}`);
  }
  return next();
};
await Promise.all([next(), next(), next(), next()]);
