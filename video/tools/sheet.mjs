// Contact sheets: every shot at 25%, 50% and 75% of its length, eight shots per sheet,
// written to video/renders/sheet_01.png, sheet_02.png, ...
//
//   node video/tools/sheet.mjs                 every shot
//   node video/tools/sheet.mjs --from S09 --to S20     writes sheet_S09-S20_01.png, ...

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arg, launch, openStage, repo, seek, startServer, timeline } from "./stage.mjs";

const tl = timeline();
const from = arg("from", tl.shots[0].id), to = arg("to", tl.shots[tl.shots.length - 1].id);
const PER = 8, TW = 480, TH = 270, FR = [0.25, 0.5, 0.75];
const out = join(repo, "video", "renders");
mkdirSync(out, { recursive: true });

const srv = await startServer();
const browser = await launch();
try {
  const { page, info, errors } = await openStage(browser, srv.url, `from=${from}&to=${to}`, { width: TW, height: TH });
  const rows = [];
  for (const s of info.shots) {
    const shot = tl.shots.find((x) => x.id === s.id);
    const imgs = [];
    for (const f of FR) {
      await seek(page, s.at + s.durMs * f);
      imgs.push((await page.screenshot({ type: "png" })).toString("base64"));
    }
    rows.push({ id: s.id, view: s.view, take: shot.take ?? "", screen: shot.screen, imgs });
    process.stdout.write(`\r${rows.length}/${info.shots.length} shots`);
  }
  await page.close();
  const full = from === tl.shots[0].id && to === tl.shots[tl.shots.length - 1].id;
  if (full) {
    for (const f of readdirSync(out)) if (/^sheet_\d+\.png$/.test(f)) rmSync(join(out, f));
  }
  const sheetPage = await browser.newPage({ viewport: { width: 220 + (TW + 12) * 3 + 12, height: 400 }, deviceScaleFactor: 1 });
  const written = [];
  for (let i = 0; i < rows.length; i += PER) {
    const part = rows.slice(i, i + PER);
    const html = `<!doctype html><html><body style="margin:0;background:#05060A;font:14px monospace;color:#E8ECF4">
      ${part.map((r) => `<div style="display:flex;gap:12px;padding:6px 12px;border-bottom:1px solid #222">
        <div style="width:196px;padding-top:6px"><div style="font-size:26px;font-weight:bold">${r.id}</div><div style="color:#3DF2FF">${r.view}</div>
          <div style="color:#7A8499">${r.take}</div><div style="color:#7A8499;font-size:11px;margin-top:6px">${r.screen.replace(/</g, "&lt;").slice(0, 160)}</div></div>
        ${r.imgs.map((b) => `<img width="${TW}" height="${TH}" src="data:image/png;base64,${b}">`).join("")}</div>`).join("")}
      </body></html>`;
    await sheetPage.setContent(html);
    // the full film is sheet_01.png ...; a partial range is sheet_S09-S20_01.png ... so it never overwrites them
    const name = `sheet_${full ? "" : `${from}-${to}_`}${String(i / PER + 1).padStart(2, "0")}.png`;
    writeFileSync(join(out, name), await sheetPage.screenshot({ fullPage: true }));
    written.push(name);
  }
  console.log(`\nwrote ${written.map((n) => "video/renders/" + n).join(", ")}`);
  if (errors.length) console.warn(`page reported ${errors.length} error(s), first: ${errors[0]}`);
} finally {
  await browser.close();
  srv.stop();
}
