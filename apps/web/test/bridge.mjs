// Bridge live-mode test: a real bridge (mock mode: recorded router output and module fixtures, no worker
// calls) and the site. The page is paired, a prompt is typed and sent, the run's graph is followed live,
// the page is reloaded mid-run, and at the end the cells on screen must be exactly the cells (and states)
// of runs/<id>/events.jsonl. Then the recorded take "smoke" must replay in director mode with no bridge.
//
//   pnpm test:bridge

import { reduce } from "@harness/protocol";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridge } from "../../bridge/src/bridge.ts";
import { config, merge } from "../../bridge/src/config.ts";
import { launch, startServer } from "../../../video/tools/stage.mjs";

const dir = mkdtempSync(join(tmpdir(), "harness-site-"));
const cfg = merge(config(), {
  bridge: { port: 0, runsDir: join(dir, "runs"), tokenFile: join(dir, "runs", ".bridge-token") },
  mock: { enabled: true, speed: 3 },
});
const bridge = await createBridge(cfg);
const srv = await startServer(Number(process.env.HARNESS_TEST_PORT ?? 5197));
const browser = await launch();
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) fails.push(what);
};
const onScreen = (page) =>
  page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-node]")].map((e) => [e.getAttribute("data-node"), e.getAttribute("data-state")])));

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // pair this page with the test bridge (what ?pair=<token> or the settings sheet does)
  await page.addInitScript(([address, token]) => localStorage.setItem("harness.bridge", JSON.stringify({ address, token })), [bridge.url, bridge.token]);

  await page.goto(`${srv.url}/`);
  const box = page.getByPlaceholder("Ask for anything");
  await box.waitFor({ timeout: 30000 });
  check(true, "prompt screen is up");
  await box.fill("say hello three ways");
  await box.press("Enter");
  await page.waitForURL(/\?run=/, { timeout: 15000 });
  const id = new URL(page.url()).searchParams.get("run");
  check(!!id && !!bridge.store.meta(id), `the prompt started run ${id}`);

  // mid-run: wait for the first child cell, note the picture, reload
  await page.waitForSelector('[data-node*="."]', { timeout: 60000 });
  const before = await onScreen(page);
  const stillRunning = bridge.store.meta(id)?.state === "running";
  await page.reload();
  await page.waitForFunction((n) => document.querySelectorAll("[data-node]").length >= n, Object.keys(before).length, { timeout: 30000 });
  const afterReload = await onScreen(page);
  check(stillRunning, "the reload happened while the run was still going");
  check(Object.keys(before).every((k) => k in afterReload), `after a reload every cell is back (${Object.keys(before).length} before, ${Object.keys(afterReload).length} after)`);

  // end: what is on screen is what events.jsonl says
  const until = Date.now() + 90000;
  while (bridge.store.meta(id)?.state === "running" && Date.now() < until) await page.waitForTimeout(250);
  check(bridge.store.meta(id)?.state === "done", "the run finished");
  const final = reduce(bridge.store.events(id));
  const want = Object.fromEntries(final.order.map((n) => [n, final.nodes[n].state]));
  await page.waitForFunction((w) => {
    const got = Object.fromEntries([...document.querySelectorAll("[data-node]")].map((e) => [e.getAttribute("data-node"), e.getAttribute("data-state")]));
    return JSON.stringify(Object.keys(got).sort().map((k) => [k, got[k]])) === JSON.stringify(Object.keys(w).sort().map((k) => [k, w[k]]));
  }, want, { timeout: 15000 }).catch(() => {});
  const got = await onScreen(page);
  check(JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(want).sort()), `graph matches events.jsonl (${Object.keys(want).length} cells: ${Object.entries(want).map(([k, v]) => `${k}=${v}`).join(", ")})`);
  if (JSON.stringify(Object.entries(got).sort()) !== JSON.stringify(Object.entries(want).sort())) console.log("  on screen:", got);

  // evidence comes from the bridge with the token in the path
  const kid = final.order.find((n) => n.includes("."));
  await page.locator(`[data-node="${kid}"]`).click();
  await page.waitForSelector(`[data-focus="${kid}"]`, { timeout: 5000 }).catch(() => {});
  check((await page.locator(`[data-focus="${kid}"]`).count()) === 1, `clicking ${kid} opens its focus view`);
  await page.keyboard.press("Escape");

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors[0] : ""}`);

  // offline: the recorded take replays in director mode without the bridge
  await bridge.close();
  const dpage = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const derr = [];
  const toBridge = [];
  dpage.on("pageerror", (e) => derr.push(String(e)));
  dpage.on("request", (r) => {
    if (r.url().startsWith(bridge.url)) toBridge.push(r.url());
  });
  await dpage.goto(`${srv.url}/?director=1&take=smoke`);
  await dpage.waitForFunction(() => window.__harness?.mode === "director" && window.__harness.ready, null, { timeout: 60000 });
  const dur = await dpage.evaluate(() => window.__harness.duration);
  await dpage.evaluate((ms) => window.__harness.seek(ms), dur - 1);
  const cells = await onScreen(dpage);
  check(Object.keys(cells).length >= 5 && Object.values(cells).every((s) => s === "done"), `take smoke replays offline: ${Object.keys(cells).length} cells, all done`);
  await dpage.evaluate(() => window.__harness.seek(0));
  check(Object.keys(await onScreen(dpage)).length <= 1, "at t=0 the take has at most the root");
  check(toBridge.length === 0, "director replay makes no bridge requests");
  check(derr.length === 0, `no page errors in director replay${derr.length ? ": " + derr[0] : ""}`);
} finally {
  await browser.close();
  srv.stop();
  await bridge.close().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
console.log(fails.length ? `\n${fails.length} check(s) failed` : "\nbridge live mode: all checks passed");
process.exit(fails.length ? 1 : 0);
