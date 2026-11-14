// The run's chosen song. Nothing is generated here: the author picked the song, and this cell hands it to
// whoever asked (a game's "add music", a design's music piece). It takes the longest audio file in
// assets/music/ (where the author can put a longer version), else video/makeasong.mp3. The prompt only names
// the use; it does not change the song.
//
// files: the song first, which is what request() delivers.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SONGS = join(REPO, "assets", "music");
const DEFAULT = join(REPO, "video", "makeasong.mp3");

export function chosenSong(): string | null {
  const own = existsSync(SONGS)
    ? readdirSync(SONGS)
        .filter((f) => /\.(mp3|wav|ogg)$/i.test(f))
        .map((f) => join(SONGS, f))
        .sort((a, b) => statSync(b).size - statSync(a).size)
    : [];
  return own[0] ?? (existsSync(DEFAULT) ? DEFAULT : null);
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const src = chosenSong();
  if (!src) throw new Error("no chosen song: put one in assets/music/ or video/makeasong.mp3");
  ctx.step("Taking the chosen song", input.prompt ? `for: ${input.prompt.slice(0, 120)}` : undefined, "music");
  const file = join(ctx.dir, `song${extname(src).toLowerCase()}`);
  copyFileSync(src, file);
  const secs = await duration(ctx, file);
  const uri = await ctx.evidence("audio", file, "The chosen song", secs ? { seconds: secs } : undefined);
  return { summary: `Song ready${secs ? ` (${secs.toFixed(1)} s)` : ""}`, files: [{ name: basename(file), uri, kind: "audio" }] };
}

async function duration(ctx: ModuleContext, file: string): Promise<number | null> {
  const ff = ctx.config.paths?.ffmpeg;
  const probe = ff && !/^<.*>$/.test(ff) ? join(dirname(ff), `ffprobe${extname(ff)}`) : "ffprobe";
  const r = await ctx.sh(probe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeoutMs: 20_000 }).catch(() => null);
  const s = r && r.code === 0 ? Number(r.stdout.trim()) : NaN;
  return Number.isFinite(s) ? Math.round(s * 100) / 100 : null;
}
