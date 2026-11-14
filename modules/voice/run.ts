// Narration in the author's cloned voice, through the video studio's own tool (config paths.studio):
//   python <studio>/shared/tools/tts_narration.py script.txt <out> --fx none
// The tool reads the voice key and the cloned voice id from the studio's .env itself (nothing here touches
// them), asks for speech with character timings, and writes narration.wav (44.1 kHz mono) and words.json
// ([{w, start, end, emph, beat}], one beat per script line). `--fx none` keeps the voice as it was recorded.
//
// Voice credits: one request reads one short script (at most MAX_CHARS). Results are cached by script text under
// runs/.cache/voice, so the same script never costs credits twice.
//
// files: narration.wav first (what request() delivers), then words.json.

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(REPO, "runs", ".cache", "voice");
const MAX_CHARS = 600;

type Word = { w: string; start: number; end: number; emph?: boolean; beat?: number };

/** The words to say: drops a lead-in such as "Read this in my voice:" and the quotes around the script. */
export function scriptOf(prompt: string): string {
  let s = prompt.replace(/\r/g, "").trim();
  // "Read this in my voice: ...", "Voice over for the trailer: ...", 'Say "..." in my voice' (not "Say hello: ...")
  const lead = /^(?:please\s+)?(?:read|say|narrate|speak|voice)\b([^:\n"“]{0,60}?)(:|(?=["“]))\s*/i.exec(s);
  if (lead && (lead[2] !== ":" || /\b(this|these|following|voice|aloud|out|over|script|lines?|it)\b/i.test(lead[1]))) s = s.slice(lead[0].length).trim();
  // a quoted script, maybe followed by a short tail ("in my voice")
  const q = /^["“]([^"”]+)["”][^"“]{0,40}$/.exec(s);
  return (q ? q[1] : s).trim();
}

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const script = scriptOf(input.prompt);
  if (!script) throw new Error("nothing to read");
  if (script.length > MAX_CHARS) throw new Error(`the script is ${script.length} characters; one voice request reads at most ${MAX_CHARS}`);
  const key = createHash("sha256").update(JSON.stringify([script, "none", 1])).digest("hex").slice(0, 16);
  const cache = join(CACHE, key);

  if (existsSync(join(cache, "words.json"))) ctx.step("Reusing a reading made earlier", script.slice(0, 120), "wave");
  else await read(ctx, script, cache);

  const wav = join(ctx.dir, "narration.wav");
  const words = join(ctx.dir, "words.json");
  copyFileSync(join(cache, "narration.wav"), wav);
  copyFileSync(join(cache, "words.json"), words);
  const rows = JSON.parse(readFileSync(words, "utf8")) as Word[];
  const secs = rows.length ? rows[rows.length - 1].end : 0;
  ctx.step("Word timings", `${rows.length} words, ${secs.toFixed(1)} s`, "check");
  const uri = await ctx.evidence("audio", wav, script.slice(0, 160), { words: rows.map((r) => ({ w: r.w, start: r.start, end: r.end })), seconds: secs });
  const wuri = await ctx.output("words.json", words, "doc");
  return {
    summary: `Read ${rows.length} words in ${secs.toFixed(1)} s`,
    files: [
      { name: "narration.wav", uri, kind: "audio" },
      { name: "words.json", uri: wuri, kind: "doc" },
    ],
  };
}

async function read(ctx: ModuleContext, script: string, cache: string) {
  const studio = ctx.config.paths?.studio;
  if (!studio || /^<.*>$/.test(studio)) throw new Error("config paths.studio is not set");
  const tool = join(studio, "shared", "tools", "tts_narration.py");
  if (!existsSync(tool)) throw new Error("the studio's narration tool is missing (shared/tools/tts_narration.py)");
  const tmp = `${cache}.part`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "script.txt"), script + "\n", "utf8");
  // the tool calls ffmpeg and ffprobe by name
  const ff = ctx.config.paths?.ffmpeg;
  // (Windows names it Path; set the same key so the child does not get two)
  const pk = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const env: Record<string, string> = ff && !/^<.*>$/.test(ff) ? { [pk]: `${dirname(ff)}${delimiter}${process.env[pk] ?? ""}` } : {};
  ctx.step("Reading the script in the cloned voice", script.slice(0, 160), "wave");
  const python = ctx.config.paths?.python && !/^<.*>$/.test(ctx.config.paths.python) ? ctx.config.paths.python : "python";
  const r = await ctx.sh(python, [tool, join(tmp, "script.txt"), tmp, "--fx", "none"], { cwd: dirname(tool), env, timeoutMs: 5 * 60_000 });
  if (r.code !== 0 || !existsSync(join(tmp, "words.json"))) {
    const why = (r.stderr || r.stdout).trim().split(/\r?\n/).filter(Boolean).pop() ?? `exit ${r.code}`;
    throw new Error(`the narration tool failed: ${why.slice(0, 200)}`);
  }
  const warn = r.stdout.split(/\r?\n/).find((l) => l.startsWith("warning:"));
  if (warn) ctx.step("Timing note", warn.replace(/^warning:\s*/, ""), "alert");
  rmSync(cache, { recursive: true, force: true });
  renameSync(tmp, cache);
}
