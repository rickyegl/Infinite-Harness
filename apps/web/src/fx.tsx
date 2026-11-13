// Shot effects from the direction's fx list. Pure functions of shot-local time.

import type { CSSProperties } from "react";
import type { Fx } from "./direction.ts";
import { hash01, clamp01 } from "./layout.ts";
import { color } from "./theme.ts";

export type FxFrame = { stage: CSSProperties; overlay: { color: string; opacity: number } | null };

export function fxAt(fx: Fx[] | undefined, tau: number, beatMs: number): FxFrame {
  let tx = 0, ty = 0, sc = 1, blur = 0;
  let overlay: FxFrame["overlay"] = null;
  for (const f of fx ?? []) {
    const t0 = f.beat * beatMs;
    const dur = (f.dur ?? (f.type === "fade" ? 2 : 0.5)) * beatMs;
    const a = tau - t0;
    if (a < 0) continue;
    const k = clamp01(a / Math.max(1, dur));
    switch (f.type) {
      case "flash":
        if (k < 1) overlay = { color: f.color ?? color.white, opacity: 0.85 * (1 - k) * (1 - k) };
        break;
      case "shake": {
        if (k >= 1) break;
        const amp = (f.amp ?? 18) * (1 - k);
        const step = Math.floor(a / 33);
        tx += (hash01("sx" + step) - 0.5) * 2 * amp;
        ty += (hash01("sy" + step) - 0.5) * 2 * amp;
        break;
      }
      case "punch":
        if (k < 1) sc *= 1 + (f.amount ?? 0.06) * (1 - k) * (1 - k);
        break;
      case "fade": {
        const op = f.to === "clear" ? 1 - k : k;
        overlay = { color: color.black, opacity: op };
        break;
      }
      case "blur":
        blur = Math.max(blur, (f.amount ?? 12) * (1 - k));
        break;
    }
  }
  const stage: CSSProperties = {};
  if (tx || ty || sc !== 1) stage.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
  if (blur > 0.05) stage.filter = `blur(${blur}px)`;
  return { stage, overlay };
}
