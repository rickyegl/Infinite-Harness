// Runs the forecast module through the real bridge Runner in isolation, records a fixture, and verifies mock replay.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, repoRoot } from "../../apps/bridge/src/config.ts";
import { extractFixture } from "../../apps/bridge/src/fixture.ts";
import { loadModules } from "../../apps/bridge/src/modules.ts";
import { Runner } from "../../apps/bridge/src/runner.ts";
import { RunStore } from "../../apps/bridge/src/store.ts";
import { parseJsonl } from "../../packages/protocol/src/events.ts";

export async function record(options: { config?: string; params?: Record<string, unknown>; refs?: string[]; mock?: boolean } = {}) {
  const moduleId = "forecast";
  const modDir = join(repoRoot, "modules", moduleId);
  const out = join(modDir, "out");
  mkdirSync(out, { recursive: true });
  const cfg = loadConfig(repoRoot, {
    HARNESS_CONFIG: options.config ?? process.env.HARNESS_CONFIG ?? join(repoRoot, "harness.local.json"),
    HARNESS_MOCK: options.mock ? "1" : "0",
    HARNESS_MOCK_SPEED: "1000",
  });
  cfg.bridge.runsDir = join(out, "runs");
  const mods = loadModules();
  const runner = new Runner({
    cfg,
    mods,
    store: new RunStore(cfg.bridge.runsDir),
    bridgeUrl: "http://127.0.0.1:1",
    tokenFile: "",
  });
  const { run, done } = runner.cell(null, moduleId, {
    prompt: "Forecast demand.",
    params: options.params,
    refs: options.refs,
  });
  const result = await done;
  assert(result, "The forecast module failed; inspect modules/forecast/out/runs/<id>/events.jsonl");
  const events = parseJsonl(readFileSync(join(cfg.bridge.runsDir, run.id, "events.jsonl"), "utf8"));
  assert(!events.some((e) => e.type === "node.error"), "Run contains an error event");
  const node = events.find((e) => e.type === "node.spawn" && e.module === moduleId)?.node;
  assert(node, "Missing forecast module node");
  for (const e of events) {
    if (e.node === node && (e.type === "node.output" || e.type === "node.evidence")) {
      const src = join(cfg.bridge.runsDir, run.id, e.uri);
      assert(existsSync(src), `Missing artifact ${src}`);
      copyFileSync(src, join(out, basename(src)));
    }
  }
  const chart = JSON.parse(readFileSync(join(out, "forecast.json"), "utf8"));
  assert(Array.isArray(chart.history) && chart.history.length > 0, "chart.history must be a non-empty array");
  assert(Array.isArray(chart.forecast) && chart.forecast.length > 0, "chart.forecast must be a non-empty array");
  assert(Array.isArray(chart.band) && chart.band.length === chart.forecast.length, "chart.band must match chart.forecast length");
  assert.equal(chart.forecast.length, chart.horizon);
  for (const [i, row] of chart.forecast.entries()) {
    const band = chart.band[i];
    assert(row.length === 2 && band.length === 3 && row[0] === band[0], "Forecast and band times must align");
    assert(row[0] > chart.history.at(-1)[0], "Forecast times must follow the history");
    assert([row[1], band[1], band[2]].every(Number.isFinite), "Forecast values must be finite");
    assert(band[1] <= row[1] && row[1] <= band[2], "Median must lie within the quantile band");
    assert.equal(chart.meta.forecast[i], row[1]);
    assert.deepEqual(chart.meta.band[i], band.slice(1));
  }
  assert.deepEqual(chart.meta.history, chart.history.map((row: [string, number]) => row[1]));
  const evidence = events.find((e) => e.node === node && e.type === "node.evidence");
  assert(evidence?.type === "node.evidence" && evidence.kind === "chart");
  assert.deepEqual(evidence.meta, chart.meta, "Stage metadata must match the artifact");

  if (!options.mock) {
    const fx = extractFixture(events, node, "default");
    const dest = join(modDir, "fixtures", "default");
    mkdirSync(dest, { recursive: true });
    for (const [src, name] of fx.files) {
      copyFileSync(join(cfg.bridge.runsDir, run.id, src), join(dest, name));
    }
    writeFileSync(join(modDir, "fixtures", "default.jsonl"), fx.lines.map((e) => JSON.stringify(e)).join("\n") + "\n");
    writeFileSync(
      join(out, "record.json"),
      JSON.stringify({ run: run.id, node, events: fx.lines.length, files: fx.files.size }, null, 2) + "\n",
    );
    console.log(`PASS: ${moduleId} real run ${run.id}; fixture ${fx.lines.length} events / ${fx.files.size} files`);
  } else {
    console.log(`PASS: ${moduleId} fixture replay; ${events.filter((e) => e.type === "node.output").length} outputs`);
  }
  console.log(result.summary);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await record({ mock: process.argv.includes("--mock") });
}
