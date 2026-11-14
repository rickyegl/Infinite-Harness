// The harness side of the Unity editor bridge (template/Assets/Harness/Editor/HarnessBridge.cs).
//
// One warm project is kept at paths.unityProject (default runs/.game/unity). The first use unpacks the editor's
// own URP template into it and lays modules/game.unity/template over the top; later uses only copy files that
// changed, so the editor does not recompile for nothing. Commands go through a file queue to the open editor;
// the editor is launched (paths.unityEditor -projectPath) when it is not running.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addProc } from "../../../apps/bridge/src/procs.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = resolve(HERE, "..", "template");
const REPO = resolve(HERE, "..", "..", "..");

export interface UnityPaths {
  editor: string;
  project: string;
}

export function unityPaths(config: Record<string, any>): UnityPaths {
  const editor = config.paths?.unityEditor;
  if (!editor || !existsSync(editor)) throw new Error("paths.unityEditor is not set to an installed Unity.exe");
  const project = resolve(REPO, config.paths?.unityProject ?? "runs/.game/unity");
  return { editor, project };
}

export interface OpResult {
  ok: boolean;
  error: string;
  result: string;
  ms: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Unity {
  constructor(public paths: UnityPaths, private log: (title: string, detail?: string) => void = () => {}) {}

  get project() {
    return this.paths.project;
  }
  get harnessDir() {
    return join(this.project, "Harness");
  }

  /** unpack the URP template once, then sync the overlay; returns the files that changed */
  prepare(): string[] {
    const p = this.project;
    if (!existsSync(join(p, "ProjectSettings", "ProjectVersion.txt"))) {
      this.log("Creating the Unity project", p);
      const editorDir = dirname(this.paths.editor);
      const tdir = join(editorDir, "Data", "Resources", "PackageManager", "ProjectTemplates");
      const tgz = readdirSync(tdir).find((f) => /^com\.unity\.template\.3d-cross-platform-.*\.tgz$/.test(f));
      if (!tgz) throw new Error(`no URP template in ${tdir}`);
      const tmp = join(dirname(p), `.template-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      const r = spawnSync("tar", ["-xzf", join(tdir, tgz), "-C", tmp], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`could not unpack the template: ${r.stderr}`);
      const data = join(tmp, "package", "ProjectData~");
      mkdirSync(p, { recursive: true });
      cpSync(data, p, { recursive: true });
      rmSync(tmp, { recursive: true, force: true });
      for (const junk of ["Assets/TutorialInfo", "Assets/TutorialInfo.meta", "Assets/Readme.asset", "Assets/Readme.asset.meta", "Assets/Scenes", "Assets/Scenes.meta"]) {
        rmSync(join(p, junk), { recursive: true, force: true });
      }
      // ProjectVersion.txt makes the Hub and the editor treat it as a project of this version
      const version = /Editor[\\/]([^\\/]+)[\\/]Editor[\\/]Unity\.exe$/i.exec(this.paths.editor)?.[1]?.replace(/-x86_64$/, "") ?? "6000.2.7f2";
      mkdirSync(join(p, "ProjectSettings"), { recursive: true });
      writeFileSync(join(p, "ProjectSettings", "ProjectVersion.txt"), `m_EditorVersion: ${version}\n`);
    }
    return syncTree(TEMPLATE, p);
  }

  aliveInfo(): { pid: number; t: number; playing: boolean; compiling: boolean; busy: boolean } | null {
    try {
      const a = JSON.parse(readFileSync(join(this.harnessDir, "alive.json"), "utf8"));
      return Date.now() - a.t < 6000 ? a : null;
    } catch {
      return null;
    }
  }

  /** is a Unity editor holding this project open (even one still importing)? */
  locked(): boolean {
    const lock = join(this.project, "Temp", "UnityLockfile");
    if (!existsSync(lock)) return false;
    try {
      rmSync(lock); // succeeds only when no editor holds it
      return false;
    } catch {
      return true;
    }
  }

  /** make sure the editor is open on the project and answering; launches it when needed */
  async ensureEditor(timeoutMs = 20 * 60_000): Promise<void> {
    if (this.aliveInfo()) return;
    if (!this.locked()) {
      this.log("Opening the Unity editor", this.project);
      const child = spawn(this.paths.editor, ["-projectPath", this.project], { detached: true, stdio: "ignore", windowsHide: false });
      child.unref();
      // the harness opened this editor, so `pnpm stop` may close it (an editor the author opened is never recorded)
      if (child.pid) addProc({ pid: child.pid, kind: "editor", what: `Unity editor on ${this.project}`, startedAt: Date.now() });
    } else {
      this.log("Waiting for the Unity editor", "it is open and still loading");
    }
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const a = this.aliveInfo();
      if (a && !a.compiling) return;
      await sleep(1000);
    }
    throw new Error("the Unity editor did not come up in time");
  }

  /** after files changed: wait until the editor has picked them up and finished compiling */
  async settle(timeoutMs = 5 * 60_000): Promise<void> {
    await sleep(2500);
    const t0 = Date.now();
    let quiet = 0;
    while (Date.now() - t0 < timeoutMs) {
      const a = this.aliveInfo();
      quiet = a && !a.compiling && !a.busy ? quiet + 1 : 0;
      if (quiet >= 4) return;
      await sleep(500);
    }
    throw new Error("the Unity editor kept compiling");
  }

  /** run one command in the open editor */
  async op(op: string, args: Record<string, unknown> = {}, timeoutMs = 5 * 60_000): Promise<OpResult> {
    await this.ensureEditor();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const q = join(this.harnessDir, "queue");
    const done = join(this.harnessDir, "done", `${id}.json`);
    mkdirSync(q, { recursive: true });
    mkdirSync(dirname(done), { recursive: true });
    writeFileSync(join(q, `${id}.tmp`), JSON.stringify({ id, op, ...args }));
    renameSync(join(q, `${id}.tmp`), join(q, `${id}.json`));
    const t0 = Date.now();
    let lastAlive = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (existsSync(done)) {
        const r = JSON.parse(readFileSync(done, "utf8")) as OpResult;
        rmSync(done, { force: true });
        if (!r.ok) throw new Error(`unity ${op}: ${r.error.split("\n")[0]}`);
        return r;
      }
      if (this.aliveInfo()) lastAlive = Date.now();
      // a recompile or a build can stall the heartbeat for a while; a closed editor stops it for good
      else if (Date.now() - lastAlive > 120_000 && !this.locked()) throw new Error("the Unity editor closed");
      await sleep(250);
    }
    throw new Error(`unity ${op} timed out`);
  }

  json<T = any>(r: OpResult): T {
    return r.result ? JSON.parse(r.result) : (undefined as T);
  }

  /** run commands with the editor closed (no play mode); used when the editor cannot be opened */
  batch(ops: Record<string, unknown>[], timeoutMs = 30 * 60_000): OpResult[] {
    const dir = join(this.harnessDir, "batch");
    mkdirSync(dir, { recursive: true });
    const opsFile = join(dir, "ops.json");
    const outFile = join(dir, "out.json");
    const logFile = join(dir, "editor.log");
    rmSync(outFile, { force: true });
    writeFileSync(opsFile, JSON.stringify({ ops: ops.map((o, i) => ({ id: `b${i}`, ...o })) }));
    const r = spawnSync(this.paths.editor, ["-batchmode", "-projectPath", this.project, "-executeMethod", "HarnessEditor.HarnessBridge.Batch", "-harnessOps", opsFile, "-harnessOut", outFile, "-logFile", logFile], { timeout: timeoutMs, windowsHide: true });
    if (!existsSync(outFile)) {
      const tail = existsSync(logFile) ? readFileSync(logFile, "utf8").split(/\r?\n/).filter((l) => /error|exception/i.test(l)).slice(-8).join("\n") : "";
      throw new Error(`unity batch run failed (exit ${r.status})${tail ? `:\n${tail}` : ""}`);
    }
    return JSON.parse(readFileSync(outFile, "utf8")).results;
  }

  // ------------------------------------------------------------ game.json and live flags

  get configFile() {
    return join(this.project, "Assets", "Game", "Resources", "game.json");
  }
  get flagsFile() {
    return join(this.project, "Assets", "StreamingAssets", "harness.json");
  }

  readConfig(): Record<string, any> {
    try {
      return JSON.parse(readFileSync(this.configFile, "utf8"));
    } catch {
      return {};
    }
  }

  /** merge one or more sections into game.json */
  patchConfig(patch: Record<string, any>): Record<string, any> {
    const cfg = this.readConfig();
    for (const [k, v] of Object.entries(patch)) {
      cfg[k] = v && typeof v === "object" && !Array.isArray(v) && cfg[k] && typeof cfg[k] === "object" ? { ...cfg[k], ...v } : v;
    }
    mkdirSync(dirname(this.configFile), { recursive: true });
    writeFileSync(this.configFile, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  /** start over: a fresh game.json with nothing built, and live flags back to their defaults */
  resetConfig(): void {
    mkdirSync(dirname(this.configFile), { recursive: true });
    writeFileSync(this.configFile, "{}");
    mkdirSync(dirname(this.flagsFile), { recursive: true });
    writeFileSync(this.flagsFile, JSON.stringify({ night: false, realistic: false, music: false, musicFile: "", relay: false, relayUrl: "", version: 0 }));
  }

  readFlags(file = this.flagsFile): Record<string, any> {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  }

  /** merge live flags into harness.json (the project's, and a build's when given); bumps version */
  patchFlags(patch: Record<string, unknown>, ...files: string[]): Record<string, any> {
    const all = [this.flagsFile, ...files.filter(Boolean)];
    const f = { ...this.readFlags(), ...patch };
    f.version = (Number(f.version) || 0) + 1;
    for (const file of all) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(f));
    }
    return f;
  }
}

/** copy every file of src into dest whose bytes differ; returns the relative paths copied */
export function syncTree(src: string, dest: string): string[] {
  const changed: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const s = join(dir, name);
      const d = join(dest, relative(src, s));
      if (statSync(s).isDirectory()) {
        mkdirSync(d, { recursive: true });
        walk(s);
      } else if (!existsSync(d) || !readFileSync(d).equals(readFileSync(s))) {
        mkdirSync(dirname(d), { recursive: true });
        copyFileSync(s, d);
        changed.push(relative(src, s).split("\\").join("/"));
      }
    }
  };
  walk(src);
  return changed;
}
