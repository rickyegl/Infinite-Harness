// runs/<id>/game-state.json: what the game cells built and where, so a follow-up ("make it night", "add music")
// on a finished or reopened run can find the Unity project, the build and the Roblox place without a worker.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Design } from "./design.ts";

export type GameState = {
  design?: Design;
  /** run-relative uris of the shared art, by name */
  art?: Record<string, string>;
  /** run-relative uris of the generated 3D models (model.glb, its OBJ set beside it in obj/), by slot */
  models?: Record<string, string>;
  unity?: {
    project: string;
    node: string;
    /** lap length in metres, from the Track part */
    metres?: number;
    build?: { target: string; dir: string; seconds: number; href?: string; flags: string };
  };
  /** models / banners: which generated models and pictures load as Roblox assets, and which still wait for an upload */
  roblox?: { project: string; node: string; place?: string; models?: { loaded: string[]; waiting: string[] }; banners?: { loaded: number; waiting: string[] } };
  /** live flags written so far (night, realistic, music, relay) */
  flags?: Record<string, unknown>;
};

/** a cell's artifact folder is <run>/artifacts/<node> */
export const runDirOf = (cellDir: string) => resolve(cellDir, "..", "..");

const file = (runDir: string) => join(runDir, "game-state.json");

export function readState(runDir: string): GameState {
  try {
    return existsSync(file(runDir)) ? JSON.parse(readFileSync(file(runDir), "utf8")) : {};
  } catch {
    return {};
  }
}

/** shallow-merges each top-level section */
export function patchState(runDir: string, patch: GameState): GameState {
  const s = readState(runDir) as Record<string, any>;
  for (const [k, v] of Object.entries(patch)) {
    s[k] = v && typeof v === "object" && !Array.isArray(v) && s[k] && typeof s[k] === "object" ? { ...s[k], ...v } : v;
  }
  writeFileSync(file(runDir), JSON.stringify(s, null, 2));
  return s as GameState;
}
