#!/usr/bin/env python3
"""Run time-series foundation model demand forecasting and write chart JSON."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import importlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

HERE = Path(__file__).resolve().parent
DEFAULT_CSV = HERE / "data" / "retail_demand.csv"
DEFAULT_OUT = HERE / "out"


def _read_series(csv_path: Path) -> tuple[list[str], list[float], str]:
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header or len(header) < 2:
            raise ValueError(f"CSV {csv_path} must have at least two columns (date, value)")
        value_col = header[1].strip() or "demand"
        dates: list[str] = []
        values: list[float] = []
        for row_number, row in enumerate(reader, 2):
            if len(row) < 2:
                raise ValueError(f"CSV row {row_number} needs a date and a value")
            t_raw, v_raw = row[0].strip(), row[1].strip()
            dt.date.fromisoformat(t_raw)
            value = float(v_raw)
            if not np.isfinite(value) or abs(value) > np.finfo(np.float32).max:
                raise ValueError(f"CSV row {row_number} needs a finite float32 value")
            if dates and t_raw <= dates[-1]:
                raise ValueError("CSV dates must be strictly increasing with no duplicates")
            dates.append(t_raw)
            values.append(value)
    if len(values) < 16:
        raise ValueError(f"CSV {csv_path} has too few observations ({len(values)})")
    return dates, values, value_col


def _step_dates(dates: list[str], horizon: int) -> list[str]:
    parsed = [dt.date.fromisoformat(d) for d in dates]
    month_numbers = [d.year * 12 + d.month - 1 for d in parsed]
    month_gaps = [b - a for a, b in zip(month_numbers, month_numbers[1:])]
    last = parsed[-1]
    if all(d.day == 1 for d in parsed) and len(set(month_gaps)) == 1 and month_gaps[0] > 0:
        future = [month_numbers[-1] + month_gaps[0] * i for i in range(1, horizon + 1)]
        return [dt.date(n // 12, n % 12 + 1, 1).isoformat() for n in future]
    gaps = [(b - a).days for a, b in zip(parsed, parsed[1:])]
    if len(set(gaps)) != 1:
        raise ValueError("CSV dates must have a regular day interval or month-start interval; gaps are not filled")
    return [(last + dt.timedelta(days=gaps[0] * i)).isoformat() for i in range(1, horizon + 1)]


def run_forecast(
    csv_path: Path,
    out_dir: Path,
    horizon: int,
    history_window: int,
    max_context: int,
    max_horizon: int,
    device: str,
    backend_module: str,
    backend_class: str,
    package_dir: Path,
    checkpoint: Path,
) -> dict[str, Any]:
    if not 1 <= horizon <= 1024 or not 128 <= max_horizon <= 1024 or max_horizon % 128:
        raise ValueError("Horizon must be 1..1024; max-horizon must be a multiple of 128 up to 1024")
    if not 32 <= max_context <= 15360 or max_context % 32 or max_context + max_horizon > 16384:
        raise ValueError("Max-context must be a multiple of 32 within the 16384 context + horizon limit")
    if horizon > max_horizon or history_window < 0:
        raise ValueError("Horizon exceeds max-horizon, or history-window is negative")
    if not checkpoint.is_file():
        raise ValueError("Configured local checkpoint is missing; see plan/LOCAL.md for setup")
    if device == "cpu":
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
    os.environ["HF_HUB_OFFLINE"] = "1"

    dates, values, series_name = _read_series(csv_path)
    future_dates = _step_dates(dates, horizon)
    sys.path.insert(0, str(package_dir))
    pkg = importlib.import_module(backend_module)
    model_cls = getattr(pkg, backend_class)

    t0 = time.perf_counter()
    import torch

    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("The requested GPU is unavailable")
    model = model_cls(torch_compile=False)
    model.model.device = torch.device(device)
    model.model.device_count = 1
    model.load_checkpoint(str(checkpoint), torch_compile=False)
    model.compile(
        pkg.ForecastConfig(
            max_context=max_context,
            max_horizon=max_horizon,
            normalize_inputs=True,
            use_continuous_quantile_head=True,
            force_flip_invariance=True,
            infer_is_positive=True,
            fix_quantile_crossing=True,
        )
    )
    t_load = time.perf_counter() - t0

    t1 = time.perf_counter()
    point_fc, quant_fc = model.forecast(
        horizon=horizon,
        inputs=[np.asarray(values[-max_context:], dtype=np.float32)],
    )
    t_infer = time.perf_counter() - t1

    if point_fc.shape != (1, horizon) or quant_fc.shape != (1, horizon, 10):
        raise RuntimeError("Forecast backend returned unexpected array shapes")
    if not np.isfinite(point_fc).all() or not np.isfinite(quant_fc).all():
        raise RuntimeError("Forecast backend returned non-finite values")
    if np.any(quant_fc[0, :, 1] > quant_fc[0, :, 9]):
        raise RuntimeError("Forecast backend returned a crossed quantile band")
    pts = [float(x) for x in point_fc[0]]
    q_lo = [float(x) for x in quant_fc[0, :, 1]]
    q_hi = [float(x) for x in quant_fc[0, :, 9]]

    win = len(values) if history_window <= 0 else min(len(values), history_window)
    hist_dates = dates[-win:]
    hist_vals = values[-win:]

    history_pairs = [[t, v] for t, v in zip(hist_dates, hist_vals)]
    forecast_pairs = [[t, v] for t, v in zip(future_dates, pts)]
    band_triples = [[t, lo, hi] for t, lo, hi in zip(future_dates, q_lo, q_hi)]

    payload: dict[str, Any] = {
        "series": series_name,
        "source": csv_path.name,
        "sourceObservations": len(values),
        "contextObservations": min(len(values), max_context),
        "historyCount": len(history_pairs),
        "horizon": horizon,
        "quantiles": [0.1, 0.9],
        "device": device,
        "timingSeconds": {
            "loadAndCompile": round(t_load, 3),
            "inference": round(t_infer, 3),
        },
        "history": history_pairs,
        "forecast": forecast_pairs,
        "band": band_triples,
        "meta": {
            "history": hist_vals,
            "forecast": pts,
            "band": [[lo, hi] for lo, hi in zip(q_lo, q_hi)],
            "drawBeats": 1.5,
        },
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "forecast.json"
    out_file.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    # Verify output contract
    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    for k in ("history", "forecast", "band"):
        if k not in loaded or not isinstance(loaded[k], list) or not loaded[k]:
            raise RuntimeError(f"Output JSON missing non-empty '{k}' list")
    if len(loaded["forecast"]) != len(loaded["band"]):
        raise RuntimeError("Output JSON forecast and band lengths do not match")

    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Forecast demand from a CSV series.")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Input demand CSV path")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output folder for forecast.json")
    parser.add_argument("--horizon", type=int, default=16, help="Forecast horizon steps")
    parser.add_argument(
        "--history-window",
        type=int,
        default=48,
        help="Number of trailing history points written to the chart (0 for all)",
    )
    parser.add_argument("--max-context", type=int, default=512)
    parser.add_argument("--max-horizon", type=int, default=128)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--backend-module", required=True)
    parser.add_argument("--backend-class", required=True)
    parser.add_argument("--package-dir", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    args = parser.parse_args()

    result = run_forecast(
        csv_path=args.csv.resolve(),
        out_dir=args.out.resolve(),
        horizon=args.horizon,
        history_window=args.history_window,
        max_context=args.max_context,
        max_horizon=args.max_horizon,
        device=args.device,
        backend_module=args.backend_module,
        backend_class=args.backend_class,
        package_dir=args.package_dir,
        checkpoint=args.checkpoint,
    )
    print(
        json.dumps(
            {
                "ok": True,
                "out": str((args.out / "forecast.json").resolve()),
                "contextObservations": result["contextObservations"],
                "historyLen": len(result["history"]),
                "forecastLen": len(result["forecast"]),
                "bandLen": len(result["band"]),
                "firstForecast": result["forecast"][0],
                "lastForecast": result["forecast"][-1],
                "timingSeconds": result["timingSeconds"],
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"Forecast input error: {exc}", file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Forecast backend failed; verify the installed runtime and checkpoint in plan/LOCAL.md", file=sys.stderr)
        sys.exit(1)
