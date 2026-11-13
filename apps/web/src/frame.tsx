// One frame of the stage: the view for ctx.dir.view, with the shot's fx on top. Shared by director and live.

import type { Ctx } from "./ctx.ts";
import type { Direction } from "./direction.ts";
import { fxAt } from "./fx.tsx";
import { color, font } from "./theme.ts";
import { BannerView, FocusView, GraphView, PromptView, RainView, SplitView, TitleView, WallView } from "./views.tsx";

function Draw({ ctx }: { ctx: Ctx }) {
  switch (ctx.dir.view) {
    case "prompt": return <PromptView ctx={ctx} />;
    case "graph": return <GraphView ctx={ctx} />;
    case "focus": return <FocusView ctx={ctx} />;
    case "split": return <SplitView ctx={ctx} />;
    case "wall": return <WallView ctx={ctx} />;
    case "banner": return <BannerView ctx={ctx} />;
    case "rain": return <RainView ctx={ctx} />;
    case "title": return <TitleView ctx={ctx} />;
  }
}

export function Frame({ ctx, fx }: { ctx: Ctx; fx?: Direction["fx"] }) {
  const f = fxAt(fx, ctx.tb.tau, ctx.tb.beatMs);
  return (
    <div data-view={ctx.dir.view} data-shot={ctx.shot?.id ?? ""} style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", inset: 0, ...f.stage }}>
        <Draw ctx={ctx} />
      </div>
      {f.overlay ? <div style={{ position: "absolute", inset: 0, background: f.overlay.color, opacity: f.overlay.opacity, pointerEvents: "none" }} /> : null}
    </div>
  );
}

export const Message = ({ text }: { text: string }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: color.dim, font: `500 24px ${font.mono}` }}>{text}</div>
);
