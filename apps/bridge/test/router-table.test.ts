// Router table: every case is checked against the plan the router really produced for it (recorded with
// `pnpm --filter bridge record:router`, saved in fixtures/router/). One more case runs live when the
// model proxy is up.

import { describe, expect, it } from "vitest";
import { config, isPlaceholder, withTestModel } from "../src/config.ts";
import { checkPlan, loadRecorded, parseJsonAnswer, promptKey, viaProxy, type Plan } from "../src/router.ts";
import { ACT1, CASES, CATALOG, type Case } from "./router-cases.ts";

const recorded = loadRecorded();

/** every node the plan says `id` waits for, directly or through others */
function upstream(plan: Plan, id: string, seen = new Set<string>()): Set<string> {
  for (const a of plan.nodes.find((n) => n.id === id)?.after ?? []) {
    if (seen.has(a)) continue;
    seen.add(a);
    upstream(plan, a, seen);
  }
  return seen;
}

export function judge(c: Case, plan: Plan, catalog: string[]): string[] {
  const bad: string[] = [];
  const invalid = checkPlan(plan, catalog, c.existing);
  if (invalid) bad.push(`invalid plan: ${invalid}`);
  const mods = plan.nodes.map((n) => n.module);
  for (const m of c.must) if (!mods.includes(m)) bad.push(`no ${m} node (got ${mods.join(", ")})`);
  if (c.only && plan.nodes.length !== 1) bad.push(`expected one node, got ${plan.nodes.length}: ${mods.join(", ")}`);
  for (const [m, words] of Object.entries(c.mentions ?? {})) {
    const p = plan.nodes.find((n) => n.module === m)?.prompt.toLowerCase() ?? "";
    for (const w of words) if (!p.includes(w)) bad.push(`${m} prompt does not mention ${w}`);
  }
  for (const [m, dep] of c.order ?? []) {
    const node = plan.nodes.find((n) => n.module === m);
    const depIds = plan.nodes.filter((n) => n.module === dep).map((n) => n.id);
    if (node && !depIds.some((d) => upstream(plan, node.id).has(d))) bad.push(`${m} does not come after ${dep}`);
  }
  return bad;
}

describe("router table (recorded outputs)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const rec = recorded.get(promptKey(c.prompt, c.existing));
      expect(rec, `no recorded output: run pnpm --filter bridge record:router "${c.name}"`).toBeTruthy();
      expect(judge(c, rec!.plan, rec!.catalog)).toEqual([]);
    });
  }

  it("records say which backend answered and how long it took", () => {
    for (const r of recorded.values()) {
      expect(["proxy", "worker"]).toContain(r.backend);
      expect(r.ms).toBeGreaterThan(0);
    }
  });
});

const cfg = withTestModel(config());
async function proxyUp(): Promise<boolean> {
  if (isPlaceholder(cfg.proxy.routerModel) || !process.env[cfg.proxy.apiKeyEnv]) return false;
  try {
    const r = await fetch(`${cfg.proxy.baseUrl}/models`, {
      headers: { authorization: `Bearer ${process.env[cfg.proxy.apiKeyEnv]}` },
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
const up = await proxyUp();

describe("parseJsonAnswer", () => {
  it("reads plain JSON, fenced JSON and JSON inside prose", () => {
    expect(parseJsonAnswer('{"nodes":[]}')).toEqual({ nodes: [] });
    expect(parseJsonAnswer("```json\n{\"nodes\":[]}\n```")).toEqual({ nodes: [] });
    expect(parseJsonAnswer('Here is the plan: {"nodes":[{"id":"a"}]} done')).toEqual({ nodes: [{ id: "a" }] });
    expect(() => parseJsonAnswer("no plan")).toThrow(/no JSON/);
  });
});

describe("router live", () => {
  it.skipIf(!up)("routes Act 1 through the proxy", { timeout: 120000 }, async () => {
    const act1 = CASES.find((c) => c.prompt === ACT1)!;
    const plan = await viaProxy(cfg, ACT1, CATALOG, []);
    expect(judge(act1, plan, CATALOG.map((m) => m.id))).toEqual([]);
  });
});
