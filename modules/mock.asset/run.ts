// A placeholder asset provider, so request_asset and the node.request / node.deliver handoff run end to end
// without a generator. It answers every kind whose real module is not installed yet (the runner falls back to
// it) with a file of that kind that a game can load:
//   image -> a PNG texture (a pattern coloured from the prompt) plus the SVG card with the prompt on it
//   music -> an 8-bar WAV loop; voice -> a short WAV of tones; model3d -> a glTF box; anything else -> the card

import type { ModuleContext, ModuleInput, ModuleOutput } from "@harness/protocol";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export default async function run(ctx: ModuleContext, input: ModuleInput): Promise<ModuleOutput> {
  const kind = typeof input.params?.kind === "string" ? input.params.kind : "";
  const seed = hash(input.prompt);
  if (kind === "music" || kind === "voice") {
    ctx.step(kind === "music" ? "Writing a placeholder loop" : "Making placeholder tones", input.prompt, kind === "music" ? "music" : "wave");
    const file = join(ctx.dir, kind === "music" ? "music.wav" : "voice.wav");
    writeFileSync(file, kind === "music" ? loop(seed) : tones(seed));
    const uri = await ctx.evidence("audio", file, "placeholder");
    return { summary: `Placeholder ${kind} ready`, files: [{ name: file.split(/[\\/]/).pop()!, uri, kind: "audio" }] };
  }
  if (kind === "model3d") {
    ctx.step("Making a placeholder model", input.prompt, "cube");
    const file = join(ctx.dir, "model.gltf");
    writeFileSync(file, box(seed));
    const uri = await ctx.evidence("model3d", file, "placeholder");
    return { summary: "Placeholder model ready", files: [{ name: "model.gltf", uri, kind: "model3d" }] };
  }
  ctx.step("Drawing a placeholder", input.prompt, "image");
  const files: { name: string; uri: string; kind: string }[] = [];
  if (kind === "image") {
    const png = join(ctx.dir, "texture.png");
    writeFileSync(png, texture(seed, 512));
    files.push({ name: "texture.png", uri: await ctx.evidence("image", png, "placeholder texture"), kind: "image" });
  }
  const svg = join(ctx.dir, "asset.svg");
  writeFileSync(svg, card(input.prompt));
  files.push({ name: "asset.svg", uri: await ctx.evidence("image", svg, "placeholder"), kind: "image" });
  return { summary: "Placeholder image ready", files };
}

function card(prompt: string): string {
  const lines: string[] = [];
  for (const w of prompt.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last && (last + " " + w).length <= 28) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const text = lines.slice(0, 6).map((l, i) => `<text x="512" y="${440 + i * 64}" text-anchor="middle">${esc(l)}</text>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<rect width="1024" height="1024" fill="#14161c"/><rect x="64" y="64" width="896" height="896" rx="48" fill="none" stroke="#5b8cff" stroke-width="6"/>` +
    `<g fill="#e8ecf4" font-family="sans-serif" font-size="48">${text}</g></svg>`
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** HSV (0..1) to RGB bytes */
function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** a bold banner-like pattern: diagonal bands and a ring, two colours picked from the seed */
function texture(seed: number, n: number): Buffer {
  const a = hsv((seed % 360) / 360, 0.75, 0.95), b = hsv(((seed >> 9) % 360) / 360, 0.6, 0.35);
  const raw = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const dx = x - n / 2, dy = y - n / 2, r = Math.hypot(dx, dy) / n;
      const band = Math.floor((x + y) / (n / 8)) % 2 === 0;
      const ring = r > 0.26 && r < 0.34;
      const c = ring ? [240, 240, 240] : band ? a : b;
      const o = y * (n * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

let CRC: number[] | null = null;
function crc32(buf: Buffer): number {
  CRC ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let c = 0xffffffff;
  for (const x of buf) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function wav(samples: Float32Array, rate: number): Buffer {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write("RIFF", 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write("data", 36); out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32000), 44 + i * 2);
  return out;
}

/** an 8-bar loop at 128 BPM: kick, hat, a bass line and an arpeggio, chord order picked from the seed */
function loop(seed: number): Buffer {
  const rate = 22050, bpm = 128, beat = 60 / bpm, bars = 8, len = Math.round(bars * 4 * beat * rate);
  const s = new Float32Array(len);
  const roots = [[0, 5, 7, 3], [0, 3, 5, 7], [0, 7, 5, 3]][seed % 3];
  const base = 110 * 2 ** (((seed >> 4) % 5) / 12);
  for (let i = 0; i < len; i++) {
    const t = i / rate, b = t / beat, bar = Math.floor(b / 4) % 4, inBeat = b % 1, sixteenth = Math.floor(b * 4) % 16;
    const root = base * 2 ** (roots[bar] / 12);
    let v = 0;
    v += Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-inBeat * 30)) * inBeat * beat) * Math.exp(-inBeat * 9) * 0.55; // kick
    const off = (b + 0.5) % 1;
    v += (Math.random() * 2 - 1) * Math.exp(-off * 40) * 0.12; // hat
    const bt = (b * 2) % 1;
    v += Math.sign(Math.sin(2 * Math.PI * root * 0.5 * t)) * Math.exp(-bt * 4) * 0.12; // bass
    const arp = [0, 4, 7, 12][sixteenth % 4], at = (b * 4) % 1;
    v += Math.sin(2 * Math.PI * root * 2 * 2 ** (arp / 12) * t) * Math.exp(-at * 6) * 0.14; // arpeggio
    s[i] = v * 0.8;
  }
  return wav(s, rate);
}

function tones(seed: number): Buffer {
  const rate = 22050, len = rate * 2, s = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / rate, k = Math.floor(t * 6);
    s[i] = Math.sin(2 * Math.PI * (220 + ((seed >> k) % 8) * 40) * t) * 0.3 * (t * 6 % 1 < 0.8 ? 1 : 0);
  }
  return wav(s, rate);
}

function box(seed: number): string {
  const [r, g, b] = hsv((seed % 360) / 360, 0.6, 0.9).map((x) => x / 255);
  const p = [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3];
  const buf = Buffer.alloc(p.length * 4 + idx.length * 2);
  p.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  idx.forEach((v, i) => buf.writeUInt16LE(v, p.length * 4 + i * 2));
  return JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: buf.length, uri: `data:application/octet-stream;base64,${buf.toString("base64")}` }],
    bufferViews: [{ buffer: 0, byteLength: p.length * 4 }, { buffer: 0, byteOffset: p.length * 4, byteLength: idx.length * 2 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5123, count: idx.length, type: "SCALAR" },
    ],
  });
}
