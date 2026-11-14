// A headless browser for the cells that open pages: the host's screenshot through its public address, the
// verifier's load checks. Software WebGL (the same flags as the video tools), console errors collected, and
// "is this picture blank" measured on the screenshot itself (never by reading a WebGL canvas back).

import { readFileSync } from "node:fs";

export const CHROMIUM_ARGS = [
  "--force-color-profile=srgb", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
  "--autoplay-policy=no-user-gesture-required",
];

export type Opened = {
  page: any;
  /** console errors and uncaught page errors, in order */
  errors: string[];
  /** responses that failed (4xx/5xx) */
  failed: string[];
  close: () => Promise<void>;
};

/**
 * Opens `url` at width x height. `pin` maps a host name to an address (a fresh tunnel name this computer may
 * have looked up too early and cached as missing).
 */
export async function openPage(url: string, o: { width?: number; height?: number; pin?: { host: string; ip: string }; timeoutMs?: number } = {}): Promise<Opened> {
  const { chromium } = await import("playwright");
  const args = [...CHROMIUM_ARGS, ...(o.pin ? [`--host-resolver-rules=MAP ${o.pin.host} ${o.pin.ip}`] : [])];
  const browser = await chromium.launch({ args });
  const page = await browser.newPage({ viewport: { width: o.width ?? 1280, height: o.height ?? 720 } });
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("console", (m: any) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e: Error) => errors.push(String(e.message ?? e).slice(0, 300)));
  page.on("response", (r: any) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 200)}`);
  });
  await page.goto(url, { waitUntil: "load", timeout: o.timeoutMs ?? 60_000 });
  return { page, errors, failed, close: () => browser.close() };
}

export type Pixels = { width: number; height: number; /** luminance standard deviation, 0..255 */ spread: number; /** distinct colours among the samples (5 bits per channel) */ colours: number; mean: number };

/** measures a picture (png/jpg/webp bytes) by decoding it in a page: size, spread of brightness, colour count */
export async function measure(page: any, bytes: Buffer, mime = "image/png"): Promise<Pixels> {
  const data = `data:${mime};base64,${bytes.toString("base64")}`;
  return page.evaluate(async (src: string) => {
    const W = globalThis as any; // runs in the page
    const im = new W.Image();
    im.src = src;
    await im.decode();
    const w = im.naturalWidth, h = im.naturalHeight;
    const s = Math.min(1, 256 / Math.max(w, h));
    const c = W.document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext("2d");
    g.drawImage(im, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, sq = 0, n = 0;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += y; sq += y * y; n++;
      set.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    }
    const mean = n ? sum / n : 0;
    return { width: w, height: h, spread: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0, colours: set.size, mean };
  }, data);
}

/** a picture that shows something: not one flat colour */
export const blank = (p: Pixels) => p.spread < 4 || p.colours < 12;

/** measures an image file with a throwaway page */
export async function measureFile(file: string): Promise<Pixels> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const ext = file.toLowerCase().split(".").pop();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "svg" ? "image/svg+xml" : "image/png";
    return await measure(page, readFileSync(file), mime);
  } finally {
    await browser.close();
  }
}
