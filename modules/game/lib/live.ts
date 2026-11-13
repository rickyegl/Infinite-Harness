// Shared by the live follow-ups (game.lighting, game.shaders, game.music, game.relay). They are scripts, not
// workers, so each finishes in seconds on a warm editor. They find what the run built through game-state.json
// and change the editor project (for shots) and the finished build's StreamingAssets/harness.json, which the
// running game re-reads every two seconds. When the run also built the Roblox place, the same flags go into its
// Flags.luau and the place is rebuilt (about a second; a running server picks them up on its next start).

import type { ModuleContext } from "@harness/protocol";
import { existsSync } from "node:fs";
import { Unity, unityPaths } from "../../game.unity/lib/unity.ts";
import { Place } from "../../game.roblox/lib/roblox.ts";
import { type GameState, patchState, readState, runDirOf } from "./state.ts";

export type Live = { runDir: string; state: GameState; u: Unity | null; place: Place | null; buildFlags: string };

export function live(ctx: ModuleContext): Live {
  const runDir = runDirOf(ctx.dir);
  const state = readState(runDir);
  if (!state.unity && !state.roblox) throw new Error("no game has been built in this run yet");
  const u = state.unity ? new Unity(unityPaths(ctx.config), (t, d) => ctx.step(t, d, "cube")) : null;
  const place = state.roblox?.place && existsSync(state.roblox.project) ? new Place(state.roblox.project, ctx.config) : null;
  return { runDir, state, u, place, buildFlags: state.unity?.build?.flags ?? "" };
}

/** flags the Roblox place understands (music needs an uploaded audio id, so it is not passed on) */
const ROBLOX_FLAGS = new Set(["night", "realistic", "relay", "relayUrl", "musicId"]);

/** sets live flags in the project, the build and the Roblox place, and remembers them in game-state.json */
export function setFlags(l: Live, patch: Record<string, unknown>, ctx?: ModuleContext): void {
  if (l.u) l.u.patchFlags(patch, l.buildFlags);
  if (l.place) {
    const rb = Object.fromEntries(Object.entries(patch).filter(([k]) => ROBLOX_FLAGS.has(k)));
    if (Object.keys(rb).length) {
      l.place.patchFlags(rb);
      const b = l.place.build();
      ctx?.step("Rebuilt the Roblox place", `Flags.luau updated, place.rbxlx in ${b.seconds.toFixed(1)} s`, "box");
    }
  }
  patchState(l.runDir, { flags: { ...(l.state.flags ?? {}), ...patch } });
}

export const seconds = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
