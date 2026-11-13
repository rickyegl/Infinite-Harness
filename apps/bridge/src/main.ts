// pnpm --filter bridge dev   (or `pnpm dev` at the root: bridge + site)

import { createBridge } from "./bridge.ts";
import { config } from "./config.ts";

const cfg = config();
const b = await createBridge(cfg);
const site = process.env.HARNESS_SITE ?? "http://127.0.0.1:5173";
console.log(`bridge listening on ${b.url}${cfg.mock.enabled ? ` (mock, speed ${cfg.mock.speed})` : ""}`);
console.log(`modules: ${[...b.mods.keys()].sort().join(", ") || "none"}`);
if (b.recovered.length) console.log(`closed ${b.recovered.length} interrupted run(s) as failed: ${b.recovered.join(", ")}`);
// the token goes to the author's own terminal only, never into a log or a piped output
if (process.stdout.isTTY) console.log(`pairing token: ${b.token}\npair the site: ${site}/?pair=${b.token}`);
else console.log(`pairing token: in ${b.tokenFile} (printed only on an interactive terminal)`);

const stop = async () => {
  await b.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
