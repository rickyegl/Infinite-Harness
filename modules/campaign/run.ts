// Campaign: one ad set for the run's game, one brief per audience (Unity players, Roblox players). A worker writes
// the briefs (an angle, a headline and a call to action per audience); then the cell spawns the pieces side by side
// as its own subtree: the Explainer reel (the Unity game), the Premise reel (Roblox), one Ad Image per audience and the Trailer cut
// (Unity gameplay), and finally the Publish dry run over every reel that came out. Each reel asks the Voice cell
// for its narration in its own recipe's voice, after the author's go on its script.
//
// A piece that cannot finish yet (the trailer without the author's track, a reel waiting at its gate that was
// stopped) is reported in the summary; the rest of the set still lands.
//
// params: audiences (default ["unity", "roblox"]), pieces (default all: "explainer", "premise", "ads", "trailer",
// "publish").

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT } from "../game/lib/design.ts";
import { readState } from "../game/lib/state.ts";
import { runDirOf } from "../_shared/studio.ts";

export type Audience = "unity" | "roblox";
export type Brief = { audience: Audience; who: string; angle: string; headline: string; cta: string };
const WHO: Record<Audience, string> = { unity: "Unity players", roblox: "Roblox players" };
const PIECES = ["explainer", "premise", "ads", "trailer", "publish"] as const;
type Piece = (typeof PIECES)[number];

/** the briefs a worker wrote, cleaned; any audience it missed gets a plain default */
export function briefsOf(raw: unknown, audiences: Audience[], title: string): Brief[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { briefs?: unknown })?.briefs) ? (raw as { briefs: unknown[] }).briefs : [];
  const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
  return audiences.map((a) => {
    const b = (list as Record<string, unknown>[]).find((x) => String(x?.audience ?? "").toLowerCase().includes(a)) ?? {};
    return {
      audience: a,
      who: WHO[a],
      angle: clip(b.angle, 240) || `${title}: a kart race where the riders fight, built for ${WHO[a]}.`,
      headline: clip(b.headline, 48) || (a === "roblox" ? "RACE. FIGHT. LOOP." : "LOOPS. TWISTS. CHAOS."),
      cta: clip(b.cta, 24) || "PLAY NOW",
    };
  });
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const p = input.params ?? {};
  const audiences = (Array.isArray(p.audiences) ? (p.audiences as string[]) : ["unity", "roblox"]).filter((a): a is Audience => a === "unity" || a === "roblox");
  const want = new Set<Piece>((Array.isArray(p.pieces) ? (p.pieces as string[]) : [...PIECES]).filter((x): x is Piece => (PIECES as readonly string[]).includes(x)));
  const runDir = runDirOf(ctx);
  const state = readState(runDir);
  const d = state.design ?? DEFAULT;
  const title = d.hud?.title || d.title || "Kart Racer";

  // 1. one brief per audience
  ctx.step("Writing the briefs", audiences.map((a) => WHO[a]).join(", "), "pencil");
  const briefFile = join(ctx.dir, "briefs.json");
  await ctx.agent(
    [
      `Write briefs.json in your working folder and nothing else: a JSON array with one object per audience (${audiences.map((a) => `"${a}"`).join(", ")}),`,
      `each {"audience", "angle", "headline", "cta"}, for an ad campaign for the kart racing game "${title}".`,
      `The game: ${d.pitch}`,
      `angle: one sentence on why this audience would play it. headline: at most 5 words, CAPS, for an ad image. cta: at most 3 words.`,
      `Unity players get it as a PC or browser build; Roblox players get it as a Roblox experience. Never name a company other than those two platforms.`,
      `The request: ${input.prompt}`,
    ].join("\n"),
    { cwd: ctx.dir, timeoutMs: 3 * 60_000 },
  );
  let raw: unknown = [];
  try {
    raw = existsSync(briefFile) ? JSON.parse(readFileSync(briefFile, "utf8")) : [];
  } catch {
    ctx.step("Briefs unreadable", "using the default lines", "alert");
  }
  const briefs = briefsOf(raw, audiences, title);
  writeFileSync(briefFile, JSON.stringify(briefs, null, 1));
  for (const b of briefs) ctx.step(`Brief: ${b.who}`, `${b.headline} / ${b.cta}. ${b.angle}`, "doc");

  // 2. the pieces, side by side
  const jobs: { what: string; run: () => Promise<ModuleOutput> }[] = [];
  const roblox = briefs.find((b) => b.audience === "roblox");
  const unity = briefs.find((b) => b.audience === "unity");
  if (want.has("explainer"))
    jobs.push({ what: "Explainer", run: () => ctx.spawn("reel.explainer", { prompt: `${unity?.angle ?? d.pitch}\nFor ${unity?.who ?? "players"}.`, params: { audience: unity?.who ?? "players" } }, { label: "Explainer" }) });
  if (want.has("premise") && roblox)
    jobs.push({ what: "Premise Reel", run: () => ctx.spawn("reel.premise", { prompt: `${roblox.angle}\nFor ${roblox.who}.` }, { label: "Premise Reel" }) });
  if (want.has("ads"))
    for (const b of briefs)
      jobs.push({
        what: `Ad Image, ${b.who}`,
        run: () => ctx.spawn("ad.image", { prompt: `${title}: ${b.angle}`, params: { headline: b.headline, cta: b.cta, audience: b.who } }, { label: `Ad Image: ${b.who}` }),
      });
  if (want.has("trailer") && (state.unity || !unity))
    jobs.push({ what: "Trailer", run: () => ctx.spawn("reel.trailer", { prompt: `Launch trailer of ${title} for ${unity?.who ?? "players"}.` }, { label: "Trailer" }) });
  const done = await Promise.allSettled(jobs.map((j) => j.run()));

  const files: NonNullable<ModuleOutput["files"]> = [];
  const made: string[] = [];
  const open: string[] = [];
  done.forEach((r, i) => {
    if (r.status === "fulfilled") {
      made.push(jobs[i].what);
      files.push(...(r.value.files ?? []));
    } else {
      const why = r.reason instanceof Error ? r.reason.message : String(r.reason);
      open.push(`${jobs[i].what}: ${why}`);
      ctx.step(`${jobs[i].what} not finished`, why, "alert");
    }
  });

  // 3. where the reels would go (dry run; never posts)
  if (want.has("publish") && made.length) {
    try {
      const pub = await ctx.spawn("publish", { prompt: `Dry-run publishing plan for the ${title} campaign.` }, { label: "Publish (dry run)" });
      made.push("Publish plan");
      files.push(...(pub.files ?? []));
    } catch (e) {
      open.push(`Publish plan: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  writeFileSync(join(ctx.dir, "campaign.json"), JSON.stringify({ title, briefs, made, open }, null, 1));
  return {
    summary: `${title} campaign for ${briefs.map((b) => b.who).join(" and ")}: ${made.join(", ") || "nothing yet"}${open.length ? `. Still open: ${open.join("; ")}` : ""}`,
    files,
  };
}
