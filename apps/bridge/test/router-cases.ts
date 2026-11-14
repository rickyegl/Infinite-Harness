// Router table: each case is a prompt, the cells already in the run, and what the plan must contain.
// The catalog is the planned module list (test/catalog.json), so the table does not depend on which
// modules are installed today.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModuleSummary } from "../src/modules.ts";
import type { Existing } from "../src/router.ts";

export const CATALOG: ModuleSummary[] = JSON.parse(readFileSync(join(import.meta.dirname, "catalog.json"), "utf8"));

export type Case = {
  name: string;
  prompt: string;
  existing: Existing[];
  /** modules the plan must contain */
  must: string[];
  /** when set, the plan is exactly one node */
  only?: boolean;
  /** words that must appear in the prompt of the node with this module */
  mentions?: Record<string, string[]>;
  /** when set: [node module, module it must come after] */
  order?: [string, string][];
  /** the catalog to route against (default CATALOG) */
  catalog?: "planned" | "installed";
};

export const ACT1 =
  "Make a 3d racing game where humanoids fight while racing on Unity. And Roblox. Also make a game trailer. Also make an ad campaign tailored to Unity and Roblox players. Host the game on browser, and at the end show the process on a video. Make no mistakes.";

// Act 1 leaves these cells; Act 5 runs as follow-ups in the same run
const act1: Existing[] = [
  { id: "game", module: "game", label: "Racing game" },
  { id: "trailer", module: "reel.trailer", label: "Game trailer" },
  { id: "campaign", module: "campaign", label: "Ad campaign" },
  { id: "host", module: "host", label: "Browser host" },
  { id: "recorder", module: "recorder", label: "Process video" },
  { id: "verify", module: "verify", label: "Verifier" },
];

// Act 5: [prompt, module, id the cell gets]; each prompt sees every cell before it
const act5: [string, string, string][] = [
  ["Show me a house.", "assets.image", "house"],
  ["Make the walls red.", "assets.image.edit", "house-red"],
  ["Transparent background.", "assets.cutout", "house-cutout"],
  ["Design the house.", "drafting", "house-plan"],
  ["Build it on Blender.", "blender", "house-3d"],
  ["Render it.", "blender.render", "house-render"],
  ["Make it a video.", "assets.video", "house-video"],
  ["Check all presentations on Canvas and make a study guide for every single test.", "study", "study"],
  ["CAD a drum shooter FRC robot prototype.", "cad", "robot"],
  // ASSUMED: the board is still to be decided (video/SHOTS.md S38); any board name routes the same way
  ["Make a motor driver PCB.", "pcb", "board"],
  ["Forecast demand.", "forecast", "forecast"],
  ["Detect anomaly.", "anomaly", "anomaly"],
  ["Put the car on the house.", "blender", "car-house"],
  ["Put the house on the game.", "game", "house-game"],
];

export const CASES: Case[] = [
  {
    name: "act 1",
    prompt: ACT1,
    existing: [],
    // ASSUMED: "Game (Unity+Roblox)" is one game cell whose prompt names both engines. No voice node: the
    // trailer and the campaign's reels narrate themselves after the author's go (router.md rule 7, plan 05)
    must: ["game", "reel.trailer", "campaign", "host", "recorder", "verify"],
    mentions: { game: ["unity", "roblox"], campaign: ["unity", "roblox"] },
    order: [["host", "game"], ["verify", "game"]],
  },
  ...act5.map(([prompt, module], i): Case => ({
    name: `act 5: ${prompt}`,
    prompt,
    existing: [...act1, ...act5.slice(0, i).map(([, m, id]) => ({ id, module: m, label: id.replace(/-/g, " ") }))],
    must: [module],
    only: true,
  })),
  { name: "approve a waiting script", prompt: "The explainer script looks good, go.", existing: act1, must: ["approve"], only: true },
  { name: "smoke", prompt: "say hello three ways", existing: [], must: ["mock.agent"], only: true, catalog: "installed" },
];
