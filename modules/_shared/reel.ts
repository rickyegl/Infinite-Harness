// What the explainer and premise reels share: counting a script's spoken words, the narration (a voice request
// with the reel's own preset, cached by text and voice), sound cues from the studio's local sound library, the
// studio's captions and assembler, and the final limiter pass from its recipe.

import type { ModuleContext } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { cacheKey, presetOf } from "../voice/run.ts";
import { refPath } from "./image.ts";
import { REPO, duration, ff, ffEnv, python, studioRoot, studioTool, why } from "./studio.ts";

export type Word = { w: string; start: number; end: number; emph?: boolean; beat?: number };
export type Cue = { t: number; cue: string };
export type Sfx = { t: number; file: string; gain_db: number };

/** the lines the voice reads: no `#` lines, no blank lines */
export const spokenText = (script: string): string =>
  script.replace(/\r/g, "").split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n").trim();

/** the spoken words of a script (audio tags and caption stars left out) */
export const spokenWords = (script: string): string[] =>
  spokenText(script).split("\n").flatMap((l) => l.replace(/^\s*\[[a-z ]+\]\s*/i, "").replace(/\*/g, "").split(/\s+/)).filter((w) => /[\p{L}\p{N}]/u.test(w));

/** the word count a script needs for `seconds` of finished reel at `wps` words a second (the reel runs 0.8 s past the voice) */
export function wordRange(seconds: number, wps: number): [number, number] {
  return [Math.round((seconds - 2.5) * wps), Math.round((seconds + 0.5) * wps)];
}

/** the title from a "# Title: ..." line */
export const titleOf = (script: string): string => /^#\s*Title:\s*(.+)$/im.exec(script)?.[1]?.trim() ?? "";

/** true when this script has been read in this voice before (a re-render: no credits, no new go needed) */
export function voiceCached(ctx: ModuleContext, script: string, preset: string): boolean {
  return existsSync(join(REPO, "runs", ".cache", "voice", cacheKey(spokenText(script), presetOf(ctx.config, preset)), "words.json"));
}

/** the narration: a voice request with the reel's preset; copies narration.wav and words.json into `voiceDir` */
export async function narrate(ctx: ModuleContext, script: string, preset: string, voiceDir: string): Promise<{ wav: string; words: string; rows: Word[] }> {
  const got = await ctx.request("voice", { prompt: spokenText(script), params: { preset, verbatim: true } });
  const wavUri = got.files?.find((f) => f.name === "narration.wav")?.uri;
  const wordsUri = got.files?.find((f) => f.name === "words.json")?.uri;
  if (!wavUri || !wordsUri) throw new Error("the voice cell gave no narration");
  mkdirSync(voiceDir, { recursive: true });
  const wav = join(voiceDir, "narration.wav");
  const words = join(voiceDir, "words.json");
  copyFileSync(refPath(ctx, wavUri), wav);
  copyFileSync(refPath(ctx, wordsUri), words);
  return { wav, words, rows: JSON.parse(readFileSync(words, "utf8")) as Word[] };
}

/** word timings as compact lines for a worker: "0.12 What" */
export const timingLines = (rows: Word[]): string => rows.map((r) => `${r.start.toFixed(2)} ${r.w}`).join("\n");

/** the studio's local sound library (names without .wav); nothing is downloaded */
export function soundLibrary(ctx: ModuleContext): string[] {
  const dir = join(studioRoot(ctx), "shared", "sfx", "mixkit");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".wav")).map((f) => f.slice(0, -4)).sort() : [];
}

const SOFT = /whoosh|woosh|sparkle|chime|buzz|ping|tone|blow|power-up/;
/** gain from the studio's recipe: -10 dB for hits, locks and keys, -13 dB for whooshes, sparkles, chimes, buzzers */
export const gainOf = (cue: string): number => (SOFT.test(cue) ? -13 : -10);

/** keeps the cues that name a library sound and fall inside the reel, adds the hook hit at 0.03 s if none is near 0 */
export function cleanCues(cues: Cue[], library: string[], seconds: number, hook = "movie-whoosh-impact-presentation-2903"): Cue[] {
  const lib = new Set(library);
  const ok = cues
    .filter((c) => c && typeof c.t === "number" && Number.isFinite(c.t) && c.t >= 0 && c.t < seconds - 0.2 && lib.has(String(c.cue).replace(/\.wav$/, "")))
    .map((c) => ({ t: Math.round(c.t * 100) / 100, cue: String(c.cue).replace(/\.wav$/, "") }))
    .sort((a, b) => a.t - b.t);
  if (!ok.some((c) => c.t < 0.3) && lib.has(hook)) ok.unshift({ t: 0.03, cue: hook });
  return ok.slice(0, 90);
}

/** mix-ready copies of the cues' sounds in `sfxDir` (trimmed, at most 2 s, peak -1 dBFS) via the studio's own helper */
export async function prepareSfx(ctx: ModuleContext, cues: Cue[], sfxDir: string): Promise<Sfx[]> {
  mkdirSync(sfxDir, { recursive: true });
  const lib = join(studioRoot(ctx), "shared", "sfx", "mixkit");
  const names = [...new Set(cues.map((c) => c.cue))].filter((n) => !existsSync(join(sfxDir, `${n}.wav`)));
  if (names.length) {
    const py = join(sfxDir, ".prep.py");
    writeFileSync(py, PREP_PY);
    const r = await ctx.sh(python(ctx), [py, lib, sfxDir, ...names], { cwd: join(studioRoot(ctx), "shared", "tools"), env: ffEnv(ctx, { PYTHONDONTWRITEBYTECODE: "1" }), timeoutMs: 5 * 60_000 });
    rmSync(py, { force: true });
    if (r.code !== 0) throw new Error(`preparing the sounds failed: ${why(r)}`);
  }
  return cues.map((c) => ({ t: c.t, file: `sfx/${c.cue}.wav`, gain_db: gainOf(c.cue) }));
}
const PREP_PY = String.raw`
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, ".")
from mixkit_sfx import ffmpeg_ready
lib, out = Path(sys.argv[1]), Path(sys.argv[2])
for n in sys.argv[3:]:
    ffmpeg_ready(lib / f"{n}.wav", out / f"{n}.wav", 2.0)
`;

/** bottom captions, 1-3 words at a time (the explainer style); `pos` "top" for the premise style */
export async function captions(ctx: ModuleContext, words: string, out: string, pos: "bottom" | "top" = "bottom", maxWords = 3): Promise<void> {
  const args = [words, out, "--pos", pos, "--max-words", String(maxWords)];
  await studioTool(ctx, "shared/tools/captions_ass.py", args, { timeoutMs: 60_000, what: "the captions" });
}

/**
 * The studio's assembler on `project.json` (picture + narration + captions + sounds + bed, -14 LUFS), then its
 * required limiter pass. Returns the final mp4.
 */
export async function assemble(ctx: ModuleContext, projectJson: string, short: string, final: string): Promise<string> {
  ctx.step("Assembling", "picture, narration, captions, sounds and bed at -14 LUFS", "layers");
  await studioTool(ctx, "shared/tools/assemble.py", [projectJson], { timeoutMs: 15 * 60_000, what: "the assembly" });
  if (!existsSync(short)) throw new Error("the assembler wrote no video");
  await ff(ctx, ["-i", short, "-c:v", "copy", "-af", "aresample=192000,alimiter=limit=0.8:attack=1:level=false,aresample=48000", "-c:a", "aac", "-b:a", "192k", final], 5 * 60_000, "the limiter");
  return final;
}

/** the licensed bed from the studio's shared music, copied into the project */
export function bed(ctx: ModuleContext, musicDir: string): string | null {
  const src = join(studioRoot(ctx), "shared", "music", "bed.wav");
  if (!existsSync(src)) return null;
  mkdirSync(musicDir, { recursive: true });
  const dst = join(musicDir, basename(src));
  if (!existsSync(dst)) copyFileSync(src, dst);
  return dst;
}

/** seconds of a file, rounded to 0.01 */
export const secondsOf = async (ctx: ModuleContext, f: string): Promise<number> => Math.round((await duration(ctx, f)) * 100) / 100;
