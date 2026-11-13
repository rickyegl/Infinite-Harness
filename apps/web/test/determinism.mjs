// Determinism test: the stage is a function of (events, t). For every shot, seek to a time inside it,
// screenshot, seek somewhere else, seek back to the same time, screenshot again: the two PNGs must be
// byte-identical. Covers the camera, effects, three.js scenes and frame sequences.
//
//   node apps/web/test/determinism.mjs                 every shot, at 960 x 540
//   node apps/web/test/determinism.mjs --from S09 --to S20 --scale 1

import { arg, launch, openStage, seek, startServer, timeline } from "../../../video/tools/stage.mjs";

const tl = timeline();
const from = arg("from", tl.shots[0].id), to = arg("to", tl.shots[tl.shots.length - 1].id);
const scale = Number(arg("scale", 0.5));
const srv = await startServer(Number(process.env.HARNESS_TEST_PORT ?? 5198));
const browser = await launch();
const fails = [];
let n = 0;

try {
  const { page, info } = await openStage(browser, srv.url, `from=${from}&to=${to}`, { width: Math.round(1920 * scale), height: Math.round(1080 * scale) });
  const shot = async () => page.screenshot({ type: "png" });
  for (const [i, s] of info.shots.entries()) {
    // two points per shot, each reached first going forward and then by a jump back from elsewhere
    for (const f of [0.37, 0.81]) {
      const t = Math.round(s.at + s.durMs * f);
      await seek(page, t);
      const a = await shot();
      const away = info.shots[(i + 7) % info.shots.length];
      await seek(page, away.at + away.durMs / 2);
      await seek(page, 0);
      await seek(page, t);
      const b = await shot();
      n++;
      if (!a.equals(b)) fails.push(`${s.id} at ${t} ms`);
    }
    process.stdout.write(`\r${i + 1}/${info.shots.length} shots`);
  }
  await page.close();
} finally {
  await browser.close();
  srv.stop();
}
console.log(`\ndeterminism: ${n - fails.length}/${n} seeks byte-identical`);
if (fails.length) {
  console.error(`differ: ${fails.join(", ")}`);
  process.exit(1);
}
