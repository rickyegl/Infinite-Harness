// pnpm pair: prints the link that pairs the site with this bridge (the token is in the token file).
// Like the bridge itself, it prints the token only to an interactive terminal.

import { existsSync, readFileSync } from "node:fs";
import { abs, config } from "./config.ts";

const cfg = config();
const file = abs(cfg.bridge.tokenFile);
if (!existsSync(file)) {
  console.log("no pairing token yet: start the bridge once (pnpm dev)");
  process.exit(1);
}
const site = process.env.HARNESS_SITE ?? "http://127.0.0.1:5173";
if (process.stdout.isTTY) console.log(`${site}/?pair=${readFileSync(file, "utf8").trim()}`);
else console.log(`not an interactive terminal: the token stays in ${file}`);
