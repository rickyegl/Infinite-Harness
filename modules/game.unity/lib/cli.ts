// Drive the Unity bridge by hand, outside a run (prepare the warm project, check it compiles, take shots):
//   pnpm --filter bridge exec tsx ../../modules/game.unity/lib/cli.ts prepare
//   ... cli.ts batch '[{"op":"setup"},{"op":"shots","dir":"C:/tmp/shots","views":"overview"}]'
//   ... cli.ts op ping
//   ... cli.ts patch '{"built_track":true}'

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Unity, unityPaths } from "./unity.ts";

const repo = resolve(import.meta.dirname, "..", "..", "..");
const read = (f: string) => {
  try {
    return JSON.parse(readFileSync(join(repo, f), "utf8"));
  } catch {
    return {};
  }
};
const cfg = { ...read("harness.config.example.json"), ...read("harness.local.json") };
cfg.paths = { ...read("harness.config.example.json").paths, ...read("harness.local.json").paths };
const u = new Unity(unityPaths(cfg), (t, d) => console.log(`- ${t}${d ? `: ${d}` : ""}`));
const [cmd, arg, arg2] = process.argv.slice(2);

switch (cmd) {
  case "prepare":
    console.log(u.prepare());
    break;
  case "batch":
    u.prepare();
    console.log(JSON.stringify(u.batch(JSON.parse(arg)), null, 1));
    break;
  case "open":
    u.prepare();
    await u.ensureEditor();
    console.log("editor up");
    break;
  case "op":
    console.log(JSON.stringify(await u.op(arg, arg2 ? JSON.parse(arg2) : {}, 30 * 60_000), null, 1));
    break;
  case "patch":
    console.log(JSON.stringify(u.patchConfig(JSON.parse(arg)), null, 1));
    break;
  default:
    console.log("prepare | batch <ops json> | open | op <name> [args json] | patch <json>");
}
