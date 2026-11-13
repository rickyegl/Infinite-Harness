// "Make it night": flips the game's lighting live. The editor project gets the new look (for the shots) and the
// finished build gets it through StreamingAssets/harness.json, which the running game re-reads every two seconds,
// so a player who has the game open sees the sky go dark without restarting.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { shots } from "../game.unity/lib/parts.ts";
import { live, seconds, setFlags } from "../game/lib/live.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const t0 = Date.now();
  const l = live(ctx);
  const night = !/\b(day|daytime|daylight|morning|sunny|noon)\b/i.test(input.prompt ?? "");
  const what = night ? "night" : "day";
  ctx.step(`Switching to ${what}`, night ? "dark sky, low moon, lamps and glowing edges on, light fog" : "sun back up, lamps off", night ? "moon" : "sun");
  setFlags(l, { night }, ctx);
  if (!l.u) return { summary: `Set ${what} for the Roblox place` };
  await l.u.ensureEditor();
  l.u.patchConfig({ look: { night } });
  ctx.step(l.buildFlags ? "The running build picks it up within 2 s" : "No build yet: the next build starts at " + what, l.buildFlags ? "StreamingAssets/harness.json" : "", "check");
  await shots(ctx, l.u, ["chase", l.state.design?.track.loops ? "loop" : "overview"], night ? "Night" : "Day");
  return { summary: `${night ? "Night" : "Day"} in ${seconds(t0)}${l.buildFlags ? ", live in the running build" : ""}` };
}
