import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abs, config, isPlaceholder } from "../../apps/bridge/src/config.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

export function invocation(cfg: Record<string, any>, input: ModuleInput, outDir: string) {
  const settings = cfg.forecast ?? {};
  const required = (value: unknown, key: string): string => {
    if (typeof value !== "string" || !value.trim() || isPlaceholder(value)) {
      throw new Error(`Configure ${key} in harness.local.json; see modules/forecast/NOTES.md`);
    }
    return value;
  };
  const integer = (value: unknown, fallback: number, key: string, minimum: number, maximum: number): number => {
    const n = value ?? fallback;
    if (typeof n !== "number" || !Number.isInteger(n) || n < minimum || n > maximum) {
      throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
    }
    return n;
  };
  const horizon = integer(input.params?.horizon, settings.horizon ?? 16, "horizon", 1, 1024);
  const historyWindow = integer(input.params?.historyWindow, settings.historyWindow ?? 48, "historyWindow", 0, 1000000);
  const ref = input.refs?.find((r) => r.toLowerCase().endsWith(".csv"));
  const csv = input.params?.csv ?? ref ?? join(HERE, "data", "retail_demand.csv");
  if (typeof csv !== "string" || !csv.trim()) throw new Error("csv must be a local CSV path");
  const device = settings.device ?? "cpu";
  if (device !== "cpu" && device !== "cuda") throw new Error("forecast.device must be cpu or cuda");
  return {
    cmd: required(cfg.paths?.python, "paths.python"),
    csv: abs(csv),
    horizon,
    args: [
      "-B", abs(required(cfg.paths?.forecast, "paths.forecast")),
      "--csv", abs(csv), "--out", outDir,
      "--horizon", String(horizon), "--history-window", String(historyWindow),
      "--max-context", String(settings.maxContext ?? 512),
      "--max-horizon", String(settings.maxHorizon ?? Math.ceil(horizon / 128) * 128),
      "--device", device,
      "--backend-module", required(settings.backendModule, "forecast.backendModule"),
      "--backend-class", required(settings.backendClass, "forecast.backendClass"),
      "--package-dir", abs(required(cfg.paths?.forecastPackageDir, "paths.forecastPackageDir")),
      "--checkpoint", abs(required(cfg.paths?.forecastCheckpoint, "paths.forecastCheckpoint")),
    ],
  };
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const command = invocation(ctx.config, input, ctx.dir);
  ctx.step("Loading demand series", `${basename(command.csv)} (${command.horizon} steps ahead)`, "chart");
  const result = await ctx.sh(command.cmd, command.args, { timeoutMs: 180000 });
  if (result.code !== 0) throw new Error(`Forecast failed (exit ${result.code}); check the CSV and local runtime settings`);
  const outFile = join(ctx.dir, "forecast.json");
  const chart = JSON.parse(readFileSync(outFile, "utf8"));
  ctx.step("Forecast ready", `${chart.history.length} history points, ${chart.forecast.length} forecast steps with 10-90% quantile band`, "check");
  const uri = await ctx.evidence("chart", outFile, `Demand - ${chart.horizon} steps ahead`, chart.meta);
  await ctx.output("Demand forecast", outFile, "chart");
  return {
    summary: `Forecasted ${chart.forecast.length} steps ahead from ${chart.contextObservations} observations`,
    files: [{ name: "forecast.json", uri, kind: "chart" }],
  };
}

// Standalone CLI uses the same config loader and invocation as a live cell.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = config();
  const command = invocation(cfg, { prompt: "Forecast demand." }, join(HERE, "out"));
  const result = spawnSync(command.cmd, [...command.args, ...process.argv.slice(2)], { encoding: "utf8", timeout: 180000 });
  if (result.status === 0) process.stdout.write(result.stdout);
  else console.error("Forecast failed; verify the CSV and local runtime settings in plan/LOCAL.md");
  process.exit(result.status ?? 1);
}
