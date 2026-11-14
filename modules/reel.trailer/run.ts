// Trailer: the studio's launch-trailer recipe (trailers/HOW_TO.md) on the run's own game. It records fresh
// gameplay from the Unity game (start, loop and twist clips at 1920x1080), finds the track's beat grid with the
// studio's beats.py, plans the edit (edit.ts: splices on beats, accelerating cuts, the drop and the logo hit),
// writes one head.py per aspect and renders each with the studio's own render_tail.py: a 9:16 cut and a 16:9 cut
// of about 30 s, music only, -14 LUFS. Everything lands in the studio project trailers/projects/<Name>.
//
// The track is the author's: assets/music/trailer.(wav|mp3|flac|m4a|ogg), or params.music. Without it the cell
// stops and says so; it never makes up a track.
//
// params: seconds (default 30), music (a file), footage (mp4 files to cut instead of recording), aspects
// ("vertical", "wide"; default both).

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { DEFAULT } from "../game/lib/design.ts";
import { readState } from "../game/lib/state.ts";
import { unityFor } from "../game.unity/lib/parts.ts";
import { REPO, beatGrid, duration, ensureProject, ff, peaksOf, projectName, python, runDirOf, stills, storyboard, studioRoot, studioTool, uriOf, videoSize, waveform, ffEnv, why } from "../_shared/studio.ts";
import { type Clip, type Frame, type Role, VERTICAL, WIDE, headPy, parseBeats, planEdit } from "./edit.ts";

const EXT = ["wav", "mp3", "flac", "m4a", "ogg"];

/** the author's trailer track */
export function trackOf(p: Record<string, unknown>): string | null {
  if (typeof p.music === "string" && existsSync(p.music)) return p.music;
  const dir = join(REPO, "assets", "music");
  for (const e of EXT) if (existsSync(join(dir, `trailer.${e}`))) return join(dir, `trailer.${e}`);
  return null;
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const p = input.params ?? {};
  const dur = Math.min(60, Math.max(15, Number(p.seconds) || 30));
  const aspects = (Array.isArray(p.aspects) ? (p.aspects as string[]) : ["vertical", "wide"]).filter((a) => a === "vertical" || a === "wide");
  const runDir = runDirOf(ctx);
  const state = readState(runDir);
  const design = state.design ?? DEFAULT;
  const footage = Array.isArray(p.footage) ? (p.footage as string[]).filter((f) => existsSync(f)) : [];
  if (!footage.length && !state.unity) throw new Error("no Unity game in this run to film: build a game first, then ask for the trailer");

  const track = trackOf(p);
  if (!track) throw new Error("no trailer track yet: put the author's track in assets/music/trailer.wav (or .mp3), then ask again");

  const title = design.hud?.title || design.title || "Kart Racer";
  const name = projectName(title, "Trailer", basename(runDir));
  const proj = await ensureProject(ctx, "trailers", name);
  ctx.step("Studio project", `trailers/projects/${name}`, "box");
  for (const d of ["footage", "music", "work", "out"]) mkdirSync(join(proj, d), { recursive: true });

  // 1. the track, as 16-bit wav for the beat finder and the engine
  const wav = join(proj, "music", "trailer.wav");
  await ff(ctx, ["-y", "-v", "error", "-i", track, "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", wav], 2 * 60_000, "converting the track");
  const songSeconds = await duration(ctx, wav);
  const beatsOut = (await studioTool(ctx, "trailers/tools/beats.py", [wav], { timeoutMs: 3 * 60_000, what: "the beat finder" })).stdout;
  const beats = parseBeats(beatsOut);
  writeFileSync(join(ctx.dir, "beats.txt"), beatsOut);
  ctx.step("Beat grid", `${(60 / beats.beat).toFixed(0)} BPM, ${beats.bars.length} bars in ${songSeconds.toFixed(0)} s`, "music");

  // 2. gameplay: three clips from the game (or the given footage)
  const clips: Clip[] = [];
  const src: Record<string, string> = {};
  const size: Record<string, [number, number]> = {};
  if (footage.length) {
    for (const [i, f] of footage.entries()) {
      const key = String.fromCharCode(65 + i);
      clips.push({ key, role: (["start", "loop", "twist"] as Role[])[i % 3], seconds: await duration(ctx, f) });
      src[key] = f;
    }
  } else {
    const u = unityFor(ctx);
    // the editor compiles template changes (such as the capture's HUD switch) only on setup's asset refresh
    const changed = u.prepare();
    if (changed.some((f) => f.endsWith(".cs"))) {
      ctx.step("Updating the Unity project", changed.join(", "), "cube");
      await u.op("setup", {}, 10 * 60_000);
      await u.settle();
      await u.op("setup", {}, 10 * 60_000);
    }
    const plan: { key: string; role: Role; from: string; what: string }[] = [
      { key: "A", role: "start", from: "", what: "the start" },
      ...(design.track.loops ? [{ key: "B", role: "loop" as Role, from: "loop", what: "the loop" }] : []),
      ...(design.track.twists ? [{ key: "C", role: "twist" as Role, from: "twist", what: "the twist" }] : design.track.drop > 5 ? [{ key: "C", role: "twist" as Role, from: "drop", what: "the drop" }] : []),
    ];
    const shown: string[] = [];
    for (const c of plan) {
      const mp4 = join(proj, "footage", `${c.key}.mp4`);
      if (!existsSync(mp4)) {
        ctx.step(`Recording ${c.what}`, "12 s of the chase camera at 1920x1080 on autopilot, no HUD", "record");
        const cap = join(proj, "footage", `${c.key}_frames`);
        await u.op("play_capture", { outDir: cap, seconds: 12, fps: 30, width: 1920, height: 1080, warmup: 3, from: c.from, hud: false }, 12 * 60_000);
        await ff(ctx, ["-y", "-v", "error", "-framerate", "30", "-i", join(cap, "frame_%05d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-movflags", "+faststart", mp4], 5 * 60_000, "encoding the capture");
        rmSync(cap, { recursive: true, force: true });
      }
      clips.push({ key: c.key, role: c.role, seconds: await duration(ctx, mp4) });
      src[c.key] = mp4;
      shown.push(...(await stills(ctx, mp4, join(ctx.dir, "footage"), [2, 6, 10].map((t) => t + plan.indexOf(c) * 0.01), 480)));
    }
    if (shown.length) await storyboard(ctx, shown, `Gameplay: ${plan.map((c) => c.what).join(", ")}`, 2);
  }
  for (const c of clips) size[c.key] = await videoSize(ctx, src[c.key]);

  // 3. the edit
  const platform = state.unity?.build?.target === "webgl" ? "IN YOUR BROWSER" : "ON PC";
  const edit = planEdit(beats, songSeconds, dur, clips, { title, loops: design.track.loops, twists: design.track.twists, karts: design.karts.count, platform });
  writeFileSync(join(ctx.dir, "edit.json"), JSON.stringify(edit, null, 1));
  await beatGrid(ctx, edit.energy, edit.cuts.map((t) => Math.round((t / (4 * beats.beat)) * 100) / 100), `Beat grid: ${edit.shots.length} cuts, drop at ${edit.drop.toFixed(1)} s`, { drop: edit.drop, hit: edit.hit });

  // 4. the logo and the font, in the project's work folder as the recipe lays it out
  const work = join(proj, "work");
  const font = join(work, "LilitaOne.ttf");
  if (!existsSync(font)) copyFileSync(join(studioRoot(ctx), "shared", "fonts", "LilitaOne.ttf"), font);
  mkdirSync(join(work, "logo"), { recursive: true });
  const logo = join(work, "logo", "logo.png");
  const lr = await ctx.sh(python(ctx), [join(import.meta.dirname, "logo.py"), font, logo, title], { cwd: work, env: ffEnv(ctx, { PYTHONDONTWRITEBYTECODE: "1" }), timeoutMs: 60_000 });
  if (lr.code !== 0 || !existsSync(logo)) throw new Error(`typesetting the logo failed: ${why(lr)}`);
  await ctx.evidence("image", logo, `Logo: ${title}`);

  // 5. one render per aspect with the studio's engine (head.py + render_tail.py, as the recipe has it)
  const tail = readFileSync(join(studioRoot(ctx), "trailers", "tools", "render_tail.py"), "utf8");
  const files: NonNullable<ModuleOutput["files"]> = [];
  let vertical = "";
  for (const a of aspects) {
    const frame: Frame = a === "vertical" ? VERTICAL : WIDE;
    const dir = join(work, a);
    mkdirSync(dir, { recursive: true });
    const out = join(proj, "out", `${name}_${a === "vertical" ? "9x16" : "16x9"}.mp4`);
    const head = headPy(edit, { frame, music: wav, out, font, logo, src, size });
    writeFileSync(join(dir, "head.py"), head);
    writeFileSync(join(dir, "trailer.py"), `${head}\n${tail}`);
    const runPy = (args: string[], what: string, timeoutMs: number) => ctx.sh(python(ctx), [join(dir, "trailer.py"), ...args], { cwd: dir, env: ffEnv(ctx, { PYTHONDONTWRITEBYTECODE: "1" }), timeoutMs }).then((r) => {
      if (r.code !== 0) throw new Error(`${what} failed: ${why(r)}`);
    });
    await runPy(["sheet"], "the edit sheet", 10 * 60_000);
    if (existsSync(join(dir, "edl_sheet.jpg"))) await ctx.evidence("image", join(dir, "edl_sheet.jpg"), `Edit sheet, ${a === "vertical" ? "9:16" : "16:9"}`);
    ctx.step(`Rendering the ${a === "vertical" ? "9:16" : "16:9"} cut`, `${frame.w}x${frame.h}, ${dur} s`, "film");
    const t0 = Date.now();
    await runPy(["render"], "the render", 45 * 60_000);
    const took = Math.round((Date.now() - t0) / 1000);
    if (!existsSync(out)) throw new Error("the render wrote no video");
    const mine = join(ctx.dir, `trailer-${a === "vertical" ? "9x16" : "16x9"}.mp4`);
    copyFileSync(out, mine);
    const secs = await duration(ctx, mine);
    const peaks = await peaksOf(ctx, mine, 120);
    if (Math.max(...peaks.slice(0, Math.max(1, Math.round((2 / secs) * peaks.length)))) < 0.05) ctx.step("Quiet start", "the first 2 s are nearly silent", "alert");
    const shots = await stills(ctx, mine, join(ctx.dir, `stills-${a}`), 6, a === "vertical" ? 360 : 640);
    const uri = await ctx.evidence("video", mine, `Trailer ${a === "vertical" ? "9:16" : "16:9"}`, { frames: shots.map((f) => uriOf(ctx, f)), fps: 2, loop: true, fit: "contain", seconds: secs, renderSeconds: took });
    await ctx.output(basename(mine), mine, "video");
    files.push({ name: basename(mine), uri, kind: "video" });
    if (a === "vertical") vertical = out;
  }
  const last = join(ctx.dir, files.length ? files[0].name : "");
  if (existsSync(last)) await waveform(ctx, last, "Trailer music, -14 LUFS", { cues: edit.cuts });
  if (vertical) writeFileSync(join(ctx.dir, "reel.json"), JSON.stringify({ generator: "trailers", project: name, file: vertical, title: `${title}: launch trailer` }, null, 1));
  return { summary: `${dur} s trailer of ${title} (${aspects.map((a) => (a === "vertical" ? "9:16" : "16:9")).join(" and ")}), ${edit.shots.length} cuts on the beat`, files };
}

