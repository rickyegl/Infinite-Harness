# Forecast

Run from the repository root on this configured machine:

```powershell
pnpm --filter bridge exec tsx ../../modules/forecast/run.ts
pnpm --filter bridge exec tsx ../../modules/forecast/record.ts
pnpm --filter bridge exec tsx ../../modules/forecast/record.ts --mock
python -B modules/forecast/test_forecast.py
python -c "import json; d=json.load(open('modules/forecast/out/forecast.json')); assert {'history','forecast','band'}<=set(d) and len(d['forecast'])==len(d['band'])>0; print('CHECK PASS:', len(d['history']), len(d['forecast']), len(d['band']))"
```

The first command runs the pretrained foundation model on the bundled CSV and writes
`modules/forecast/out/forecast.json`. Pass `--csv <path>`, `--horizon <steps>`,
`--history-window <points>` (0 for all), or `--out <folder>` to override the defaults.
For horizons above 128, also pass `--max-horizon` rounded up to a multiple of 128.

The recorder runs the real module through the bridge Runner in an isolated run store under
`modules/forecast/out/runs/`, extracts its fixture, and checks the timestamped arrays against the stage
metadata. It does not start another bridge or touch active runs. `--mock` verifies replay without Python,
packages or weights. Outputs and dependencies are ignored by git; the real fixture and source CSV are committed.
A configured live bridge can invoke `pnpm cell new forecast "Forecast demand."`.

## Runtime setup

The standalone entry point and module both read the shared bridge config loader. Merge
`modules/forecast/local.example.json` into the machine's gitignored `harness.local.json` and fill its
placeholders using `plan/LOCAL.md` (Forecast runtime). That local note holds the exact package, architecture,
checkpoint revision and dependency versions. Nothing installs or downloads during a forecast.

- `paths.python`: interpreter with the tensor and array libraries installed.
- `paths.forecast`: this module's Python script.
- `paths.forecastPackageDir`: directory containing the installed forecasting package.
- `paths.forecastCheckpoint`: exact local checkpoint file from the verified snapshot.
- `forecast.backendModule` and `forecast.backendClass`: import and architecture names from local notes.
- `forecast.device`: `cpu` by default; GPU inference has not been tested in this task.
- `forecast.maxContext`, `forecast.horizon`, `forecast.historyWindow`: 512, 16 and 48 by default.

The Python script also accepts these runtime settings as explicit flags; run it with `--help` for their names.
New-machine dependency installation or a large checkpoint download must be approved separately.

Verified limits: 16384 total context plus padded horizon, context patches of 32 and output patches of 128.
The continuous quantile head supports up to 1024 steps. Histories longer than `maxContext` use only their
trailing context; the artifact records both `sourceObservations` and `contextObservations`.

## Dataset and assumptions

- ASSUMED: retail sales revenue is the demo's demand proxy, not a count of units sold. The author allowed
  any CSV. Source: U.S. Census Bureau, Advance Retail Sales: Retail Trade [RSXFSN], retrieved from
  [FRED](https://fred.stlouisfed.org/series/RSXFSN), Federal Reserve Bank of St. Louis, 2026-11-14.
  Values are millions of U.S. dollars, monthly, not seasonally adjusted; no inflation adjustment is applied.
- The bundled `data/retail_demand.csv` is a two-column date/value snapshot (renamed `date,demand`) of
  `https://fred.stlouisfed.org/graph/fredgraph.csv?id=RSXFSN`: 417 observations, January 1992 through
  September 2026. SHA-256: `61e3a8c7bf7482c4b92653c65d2675c185e46348486912480ba44c4e602b956d`. Upstream revisions do not change this snapshot.
- ASSUMED: forecast 16 months (October 2026 through January 2028), using all 417 observations as context;
  display the last 48 observations (October 2022 through September 2026) for readability.
- ASSUMED: the band is the model's 10th-to-90th quantile range. It has not been calibrated on a holdout
  set here. No forecast accuracy claim is made.
- Input is a local CSV whose first two columns are ISO date (`YYYY-MM-DD`) and finite numeric value.
  Dates must increase strictly with no missing values. Regular day intervals or regular month-start
  intervals are supported; missing intervals, duplicate dates and non-finite values are rejected.
  Live inputs accept `params.csv` or a CSV in `refs`, `params.horizon`, and `params.historyWindow`.
  Relative input paths are relative to the repository root.

## Artifact and fixture

The chart JSON has `history: [[t,v]]`, `forecast: [[t,v]]`, and `band: [[t,lo,hi]]`.
Its `meta` contains value-only history, forecast and band arrays for the existing stage chart renderer.
The module emits chart evidence, a wall output, and a returned chart file for asset handoffs.

Real run: `20261114-151306`; fixture: `fixtures/default.jsonl` (6 events, 1 JSON artifact).
The recorded CPU run loaded/configured the model in 1.452 s and inferred in
0.214 s. Credits: 0. The local GPU and remote runtimes were not used.

Verified: real run, fixture replay, finite aligned bands containing each median, metadata matching the
artifact, four malformed-input/date tests, shared typecheck, all 89 workspace tests, and module brand lint. Contract check output:

```text
CHECK PASS: 48 16 16
```

Scope: only the Forecast row of plan 07. Anomaly detection and replacing shot S39's stage fixture with this
real take belong to subsequent work. The film still uses its existing shot data until plan 08 selects this take. `pnpm film:rough` exits 0
(140.625 s, 48 shots, all cuts on beat); its current stage data produces 20 missing-resource (404) warnings.
