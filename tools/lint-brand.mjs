#!/usr/bin/env node
// Brand lint: no vendor or model name may appear as text in the app, the protocol, direction files or
// tools. The deny-list is read from harness.local.json ("brandDenyList"), so the list itself is never in
// the repo, and a hit is reported by file, line and list index, never by the word itself.
//
// Skipped, exactly as the contract says ("Maker icons"): the `maker` value in module.json files and in
// node.spawn events (.jsonl), and the files in apps/web/public/makers/.
//
// Usage: node tools/lint-brand.mjs [paths...]     (default: the scanned roots below)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const ROOTS = ["apps/web", "apps/bridge", "packages", "video/direction", "video/tools", "tools", "modules"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".vite", ".turbo", "__pycache__"]);
const SKIP_PREFIX = ["apps/web/public/makers/"];
const BINARY = /\.(png|jpe?g|gif|webp|woff2?|ttf|otf|glb|gltf|bin|mp4|webm|mov|wav|mp3|m4a|ico|zip)$/i;

const localPath = join(root, "harness.local.json");
if (!existsSync(localPath)) {
  console.log("lint:brand: no harness.local.json, so no deny-list; nothing checked");
  process.exit(0);
}
const deny = (JSON.parse(readFileSync(localPath, "utf8")).brandDenyList ?? [])
  .filter((w) => typeof w === "string" && w.trim() && !w.startsWith("<"));
if (!deny.length) {
  console.log("lint:brand: deny-list is empty; nothing checked");
  process.exit(0);
}
// Whole-word, case-insensitive. Spaces and hyphens in a term match any of space, hyphen, underscore or nothing.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = deny.map((w) => {
  const body = w.trim().split(/[\s_-]+/).map(esc).join("[\\s_-]?");
  return new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`, "i");
});

const posix = (p) => p.split(sep).join("/");
const files = [];
const walk = (abs) => {
  if (!existsSync(abs)) return;
  const rel = posix(relative(root, abs));
  if (SKIP_PREFIX.some((p) => (rel + "/").startsWith(p))) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(abs.split(sep).pop())) return;
    for (const f of readdirSync(abs)) walk(join(abs, f));
  } else if (!BINARY.test(abs)) files.push(abs);
};
const args = process.argv.slice(2);
for (const r of args.length ? args : ROOTS) walk(join(root, r));

// Removes exactly the values the contract exempts, keeping line numbers intact.
function exempt(rel, text) {
  if (rel.endsWith(".jsonl")) {
    return text.split(/\r?\n/).map((line) => {
      if (!line.trim()) return line;
      try {
        const e = JSON.parse(line);
        if (e && e.type === "node.spawn" && "maker" in e) delete e.maker;
        return JSON.stringify(e);
      } catch {
        return line;
      }
    }).join("\n");
  }
  if (rel.endsWith("module.json")) {
    try {
      const m = JSON.parse(text);
      delete m.maker;
      return JSON.stringify(m, null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

let hits = 0;
for (const abs of files) {
  const rel = posix(relative(root, abs));
  const text = exempt(rel, readFileSync(abs, "utf8"));
  // file names count too
  patterns.forEach((re, k) => {
    if (re.test(rel)) {
      console.log(`${rel}: file name matches deny-list entry #${k + 1}`);
      hits++;
    }
  });
  text.split(/\r?\n/).forEach((line, i) => {
    patterns.forEach((re, k) => {
      if (re.test(line)) {
        console.log(`${rel}:${i + 1}: matches deny-list entry #${k + 1}`);
        hits++;
      }
    });
  });
}
if (hits) {
  console.log(`lint:brand: ${hits} hit(s) in ${files.length} files`);
  process.exit(1);
}
console.log(`lint:brand: clean (${files.length} files, ${deny.length} terms)`);
