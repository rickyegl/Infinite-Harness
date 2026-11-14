// pnpm --filter bridge dev   (or `pnpm dev` at the root: bridge + site)
// pnpm bridge:public          the same, plus a quick tunnel to the bridge, so the deployed site on another
//                             device can reach it (the address and token go in that site's Settings)

import { createBridge } from "./bridge.ts";
import { config, isPlaceholder } from "./config.ts";
import { answered, tunnels } from "./tunnels.ts";

const cfg = config();
const b = await createBridge(cfg);
const site = process.env.HARNESS_SITE ?? "http://127.0.0.1:5173";
console.log(`bridge listening on ${b.url}${cfg.mock.enabled ? ` (mock, speed ${cfg.mock.speed})` : ""}`);
console.log(`modules: ${[...b.mods.keys()].sort().join(", ") || "none"}`);
if (b.recovered.length) console.log(`closed ${b.recovered.length} interrupted run(s) as failed: ${b.recovered.join(", ")}`);
// the token goes to the author's own terminal only, never into a log or a piped output
if (process.stdout.isTTY) console.log(`pairing token: ${b.token}\npair the site: ${site}/?pair=${b.token}`);
else console.log(`pairing token: in ${b.tokenFile} (printed only on an interactive terminal)`);

if (process.argv.includes("--public")) {
  const t = await tunnels.ensure(b.url, "bridge", { timeoutMs: 60_000 });
  // without the token the bridge answers 401: that is the bridge answering through the tunnel
  const ok = await answered(`${t.url}/health`, { timeoutMs: 90_000, accept: [401] });
  console.log(`public address: ${t.url}${ok ? "" : " (not answering yet; a new address can take a minute)"}`);
  const deployed = (cfg.bridge.origins ?? []).find((o) => !isPlaceholder(o));
  if (deployed && process.stdout.isTTY) console.log(`pair the deployed site: ${deployed}/?pair=${b.token}&bridge=${encodeURIComponent(t.url)}`);
}

const stop = async () => {
  await b.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
