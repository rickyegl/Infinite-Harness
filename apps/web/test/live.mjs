// Live-mode test: the stage runs on the wall clock from a fixture; clicking a cell opens the focus view and
// Escape returns to the graph. Also checks the maker badges: Image, Voice, 3D Model and Video cells carry one,
// agent and orchestrator cells do not.
//
//   node apps/web/test/live.mjs        (pnpm test:live)

import { launch, startServer } from "../../../video/tools/stage.mjs";

const srv = await startServer(Number(process.env.HARNESS_TEST_PORT ?? 5198));
const browser = await launch();
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) fails.push(what);
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // past the end of the take: every cell is on the graph
  await page.goto(`${srv.url}/?fixture=main&start=40000`);
  await page.waitForFunction(() => window.__harness?.mode === "live" && window.__harness.ready, null, { timeout: 60000 });
  await page.waitForSelector('[data-node="u.karts"]', { timeout: 20000 });
  check((await page.evaluate(() => window.__harness.view().view)) === "graph", "starts on the graph view");

  // makers: tool cells made by an outside generator show a badge; agents and orchestrators never do
  const badge = (id) => page.locator(`[data-node="${id}"] [data-maker]`).count();
  for (const id of ["a.image", "voice", "a.mesh", "a.video"]) check((await badge(id)) > 0, `${id} cell shows a maker badge`);
  for (const id of ["root", "game", "unity", "assets", "campaign", "u.karts", "r.build", "host", "a.rig"]) check((await badge(id)) === 0, `${id} cell shows no maker badge`);

  await page.locator('[data-node="u.karts"]').click();
  await page.waitForSelector("[data-focus]", { timeout: 5000 }).catch(() => {});
  const v1 = await page.evaluate(() => window.__harness.view());
  check(v1.view === "focus" && v1.focus === "u.karts", `click opens the focus view (got ${JSON.stringify(v1)})`);
  check((await page.locator('[data-focus="u.karts"]').count()) === 1, "focus panel for u.karts is on the page");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__harness.view().view === "graph", null, { timeout: 5000 }).catch(() => {});
  const v2 = await page.evaluate(() => window.__harness.view());
  check(v2.view === "graph" && v2.focus === null, `Escape returns to the graph (got ${JSON.stringify(v2)})`);
  check((await page.locator("[data-focus]").count()) === 0, "focus panel is gone");

  // the focus view also shows the maker under MADE WITH
  await page.locator('[data-node="a.image"]').click();
  await page.waitForSelector('[data-focus="a.image"]', { timeout: 5000 }).catch(() => {});
  check((await page.locator('[data-focus="a.image"] [data-maker]').count()) > 0, "a.image focus view shows MADE WITH");
  // a click on the focus panel keeps it open; a click outside it returns to the graph
  await page.locator('[data-focus="a.image"]').click({ position: { x: 20, y: 20 } });
  check((await page.evaluate(() => window.__harness.view().view)) === "focus", "a click inside the focus panel keeps it open");
  await page.mouse.click(4, 4);
  await page.waitForFunction(() => window.__harness.view().view === "graph", null, { timeout: 5000 }).catch(() => {});
  check((await page.evaluate(() => window.__harness.view().view)) === "graph", "a click outside the focus panel returns to the graph");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors[0] : ""}`);
} finally {
  await browser.close();
  srv.stop();
}
console.log(fails.length ? `\n${fails.length} check(s) failed` : "\nlive: all checks passed");
process.exit(fails.length ? 1 : 0);
