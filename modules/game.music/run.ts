// "Add music": uses the run's music if the design already asked for some, otherwise asks the asset hub for a
// loop, copies it into StreamingAssets (the editor project's and the finished build's) and switches music on.
// The running game loads it within two seconds of the flag changing.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { live, seconds, setFlags } from "../game/lib/live.ts";

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const t0 = Date.now();
  const l = live(ctx);
  const asksForStyle = (input.prompt ?? "").replace(/\b(add|some|the|music|a|soundtrack|song|please|to|it|game)\b/gi, "").trim().length > 3;
  const known = l.state.design?.art.find((a) => a.kind === "music");
  let uri = !asksForStyle && known ? l.state.art?.[known.name] : undefined;
  if (uri) ctx.step("Using the design's music", known!.name, "music");
  else {
    const prompt = asksForStyle ? input.prompt : `${known?.prompt ?? `An upbeat instrumental racing loop for "${l.state.design?.title ?? "the game"}"`}`;
    ctx.step("Asking for a music loop", prompt.slice(0, 160), "music");
    const out = await ctx.request(ctx.config.assetKinds?.music ?? "assets.music", { prompt, params: { kind: "music", name: "music" } });
    uri = out.files?.find((f) => /\.(wav|ogg|mp3)$/i.test(f.uri))?.uri;
  }
  const src = uri ? join(l.runDir, uri) : "";
  if (!src || !existsSync(src)) throw new Error("no music file came back");
  const name = `music${extname(src).toLowerCase()}`;
  const dests = [l.u && join(l.u.project, "Assets", "StreamingAssets", name), l.buildFlags && join(dirname(l.buildFlags), name)].filter(Boolean) as string[];
  for (const d of dests) {
    mkdirSync(dirname(d), { recursive: true });
    copyFileSync(src, d);
  }
  setFlags(l, { music: true, musicFile: name }, ctx);
  ctx.step(l.buildFlags ? "Playing in the running build" : "Music on in the project", `StreamingAssets/${name}`, "check");
  await ctx.evidence("audio", src, "Race music");
  return { summary: `Music on in ${seconds(t0)}${l.buildFlags ? ", live in the running build" : ""}` };
}
