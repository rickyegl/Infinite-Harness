// Evidence stage renderers, one per kind. Every one is a pure function of (evidence, age): `age` is the
// display ms since the evidence arrived. Video goes through FrameClip only.

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import * as THREE from "three";
import type { EvidenceRec } from "@harness/protocol";
import { color, font, hexAlpha, size } from "./theme.ts";
import { clamp01, easeInOut, easeOut } from "./layout.ts";

export type EvProps = {
  ev: EvidenceRec;
  /** display ms since ev arrived */
  age: number;
  url: (uri: string) => string;
  w: number;
  h: number;
  beatMs: number;
  mode: "live" | "director";
  /** the evidence before this one on the same node (for match cuts, wipes, fades) */
  prev?: EvidenceRec;
};

const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
const CHECKER: CSSProperties = { background: "repeating-conic-gradient(#3a3d46 0% 25%, #23252c 0% 50%) 0 0 / 32px 32px" };
const meta = <T,>(ev: EvidenceRec, k: string, d: T): T => ((ev.meta ?? {})[k] ?? d) as T;

export function Evidence(p: EvProps) {
  const body = (() => {
    switch (p.ev.kind) {
      case "image": return <ImageEv {...p} />;
      case "frames": return <FramesEv {...p} />;
      case "video": return <VideoEv {...p} />;
      case "model3d": return <Model3D {...p} />;
      case "audio": return <AudioEv {...p} />;
      case "chart": return <ChartEv {...p} />;
      case "doc": return <DocEv {...p} />;
      case "code": return <CodeEv {...p} />;
      case "link": return <LinkEv {...p} />;
      default: return null;
    }
  })();
  return (
    <div style={{ position: "relative", width: p.w, height: p.h, overflow: "hidden", borderRadius: size.radius, background: color.panel }}>
      {body}
      {p.ev.caption ? <Caption text={p.ev.caption} /> : null}
    </div>
  );
}

function Caption({ text }: { text: string }) {
  return (
    <div style={{ position: "absolute", left: 18, bottom: 14, font: `500 15px ${font.mono}`, color: color.text, letterSpacing: 1,
      textTransform: "uppercase", background: hexAlpha(color.bg, 0.6), padding: "4px 10px", borderRadius: 6 }}>{text}</div>
  );
}

// ---------- image: fade (default), cut, noise, wipe; draws over the previous image of the same node ----------

function ImageEv({ ev, age, url, prev, beatMs, w, h }: EvProps) {
  const reveal = meta(ev, "reveal", "fade") as string;
  const fit = meta(ev, "fit", "contain") as CSSProperties["objectFit"];
  const prevSrc = prev && prev.kind === "image" ? url(prev.uri) : meta<string | null>(ev, "before", null) ? url(meta(ev, "before", "")) : null;
  const img = (src: string, style: CSSProperties = {}) => <img src={src} style={{ ...fill, objectFit: fit, ...style }} alt="" draggable={false} />;
  // a transparent picture (a cutout) sits on a checkerboard, which also hides the picture under it
  const topImg = (style: CSSProperties = {}) =>
    meta(ev, "checker", false) ? <div style={{ ...fill, ...CHECKER, ...style }}>{img(url(ev.uri))}</div> : img(url(ev.uri), style);
  let top: ReactNode;
  if (reveal === "cut") top = topImg();
  else if (reveal === "wipe") {
    const f = easeInOut(clamp01(age / (meta(ev, "wipeBeats", 2) * beatMs)));
    top = (
      <>
        {topImg({ clipPath: `inset(0 ${(1 - f) * 100}% 0 0)` })}
        {f > 0 && f < 1 ? <div style={{ position: "absolute", top: 0, bottom: 0, left: `${f * 100}%`, width: 3, background: color.accent, boxShadow: `0 0 24px ${color.accent}` }} /> : null}
      </>
    );
  } else if (reveal === "noise") {
    const f = clamp01(age / (meta(ev, "revealBeats", 3) * beatMs));
    top = (
      <>
        {topImg({ filter: `blur(${(1 - easeOut(f)) * 18}px) contrast(${1 + (1 - f) * 0.6})` })}
        <Noise w={w} h={h} opacity={(1 - f) * 0.9} seed={Math.floor(age / 50)} />
      </>
    );
  } else {
    const f = clamp01(age / 380);
    top = topImg({ opacity: easeOut(f), filter: `blur(${(1 - f) * 10}px)` });
  }
  const showPrev = prevSrc && (reveal === "wipe" || (reveal === "fade" && age < 400) || (reveal === "noise" && false));
  return (
    <>
      {showPrev ? img(prevSrc!, reveal === "fade" ? { opacity: 1 - clamp01(age / 380) } : {}) : null}
      {top}
    </>
  );
}

/** Deterministic grain: a grid of rects whose values come from a hash of (cell, seed). */
function Noise({ w, h, opacity, seed }: { w: number; h: number; opacity: number; seed: number }) {
  if (opacity <= 0.01) return null;
  const cols = 64, rows = Math.round((cols * h) / w);
  const cw = w / cols, ch = h / rows;
  const rects: ReactNode[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let v = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
      v = Math.imul(v ^ (v >>> 13), 1274126177);
      const g = ((v >>> 0) % 255) | 0;
      rects.push(<rect key={x + y * cols} x={x * cw} y={y * ch} width={cw + 0.5} height={ch + 0.5} fill={`rgb(${g},${g},${g})`} />);
    }
  return <svg width={w} height={h} style={{ ...fill, opacity, mixBlendMode: "screen" }}>{rects}</svg>;
}

// ---------- FrameClip: the only way video is shown ----------

export function FrameClip({ frames, fps = 12, age, url, video, mode, loop = true, fit = "cover", style }: {
  frames?: string[]; fps?: number; age: number; url: (u: string) => string; video?: string; mode: "live" | "director";
  loop?: boolean; fit?: CSSProperties["objectFit"]; style?: CSSProperties;
}) {
  if (mode === "live" && video && !frames?.length) {
    return <video src={url(video)} autoPlay muted loop={loop} playsInline style={{ ...fill, objectFit: fit, ...style }} />;
  }
  if (!frames?.length) return null;
  const n = Math.floor((Math.max(0, age) / 1000) * fps);
  const i = loop ? n % frames.length : Math.min(frames.length - 1, n);
  return <img src={url(frames[i])} style={{ ...fill, objectFit: fit, ...style }} alt="" draggable={false} />;
}

function FramesEv({ ev, age, url, mode }: EvProps) {
  return <FrameClip frames={meta(ev, "frames", [ev.uri])} fps={meta(ev, "fps", 4)} loop={meta(ev, "loop", false)} age={age} url={url} mode={mode} fit={meta(ev, "fit", "cover")} />;
}

function VideoEv({ ev, age, url, mode }: EvProps) {
  return <FrameClip frames={meta(ev, "frames", [])} fps={meta(ev, "fps", 12)} video={ev.uri} loop={meta(ev, "loop", true)} age={age} url={url} mode={mode} fit={meta(ev, "fit", "cover")} />;
}

// ---------- model3d: three.js, rendered once per commit, orbit angle is a function of age ----------

type Built = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; parts: THREE.Object3D[]; root: THREE.Group };

function Model3D({ ev, age, w, h, beatMs }: EvProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const built = useRef<Built | null>(null);
  const shape = meta(ev, "procedural", "kart") as string;
  const tint = meta(ev, "color", color.accent) as string;
  useLayoutEffect(() => {
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x101020, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 3);
    scene.add(key);
    const root = new THREE.Group();
    const parts = buildShape(shape, new THREE.Color(tint));
    parts.forEach((p) => {
      p.userData.y = p.position.y;
      root.add(p);
    });
    scene.add(root);
    const grid = new THREE.GridHelper(10, 20, 0x3df2ff, 0x1a2030);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = -0.01;
    scene.add(grid);
    built.current = { renderer, scene, camera, parts, root };
    return () => {
      renderer.dispose();
      built.current = null;
    };
  }, [shape, tint]);
  useLayoutEffect(() => {
    const b = built.current;
    if (!b) return;
    b.renderer.setSize(w, h, false);
    b.camera.aspect = w / h;
    b.camera.updateProjectionMatrix();
    // parts appear one per beat (CAD assembly, house build); `partsAt` beats after arrival
    const per = meta(ev, "partBeats", 0) as number;
    b.parts.forEach((p, i) => {
      const at = per ? (i + 1) * per * beatMs : 0;
      const f = per ? clamp01((age - at) / (beatMs * 0.5)) : 1;
      p.visible = f > 0;
      p.position.y = p.userData.y + (1 - easeOut(f)) * 1.2;
    });
    const a = meta(ev, "angle", 0.6) as number + (age / 1000) * (meta(ev, "orbit", 0.35) as number);
    const r = meta(ev, "distance", 5.2) as number;
    b.camera.position.set(Math.cos(a) * r, r * 0.42, Math.sin(a) * r);
    b.camera.lookAt(0, 0.45, 0);
    b.renderer.render(b.scene, b.camera);
  });
  return <canvas ref={ref} width={w} height={h} style={{ ...fill }} />;
}

function buildShape(shape: string, tint: THREE.Color): THREE.Object3D[] {
  const mat = (c: THREE.ColorRepresentation, metal = 0.2) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: 0.45 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.userData.y = y;
    return o;
  };
  const cyl = (r: number, l: number, m: THREE.Material, x = 0, y = 0, z = 0, axis: "x" | "z" | "y" = "z") => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 24), m);
    if (axis === "z") o.rotation.x = Math.PI / 2;
    if (axis === "x") o.rotation.z = Math.PI / 2;
    o.position.set(x, y, z);
    o.userData.y = y;
    return o;
  };
  const dark = mat(0x1b1f2a, 0.6), body = mat(tint, 0.3), light = mat(0xe8ecf4, 0.1), red = mat(0xff2e63, 0.2);
  switch (shape) {
    case "house":
      return [
        box(2.4, 0.12, 2, dark, 0, 0.06),
        box(2.2, 1.1, 1.8, light, 0, 0.67),
        roof(2.5, 0.9, 2.1, red, 1.22 + 0.45),
        box(0.4, 0.7, 0.05, dark, 0.5, 0.47, 0.91),
        box(0.5, 0.4, 0.05, mat(0x3df2ff, 0.8), -0.5, 0.8, 0.91),
      ];
    case "robot":
      return [
        box(1.6, 0.12, 1.6, mat(0x5a6378, 0.5), 0, 0.18),
        cyl(0.55, 1.1, body, 0, 0.75, 0, "x"),
        cyl(0.22, 0.5, light, 0, 1.25, -0.4, "x"),
        box(1.2, 0.08, 0.7, mat(0x7a8499, 0.7), 0, 1.45, 0.1),
        ...[-0.7, 0.7].flatMap((x) => [cyl(0.15, 0.1, dark, x, 0.1, 0.6, "x"), cyl(0.15, 0.1, dark, x, 0.1, -0.6, "x")]),
      ];
    case "board": {
      const b = box(2.6, 0.08, 1.8, mat(0x0b5d3b, 0.1), 0, 0.04);
      const chips = [box(0.5, 0.12, 0.5, dark, -0.4, 0.14, 0), box(0.3, 0.1, 0.6, dark, 0.6, 0.13, -0.3), box(0.25, 0.1, 0.25, dark, 0.6, 0.13, 0.5)];
      return [b, ...chips, box(0.2, 0.3, 0.4, light, -1.15, 0.2, 0)];
    }
    default: // kart with a driver
      return [
        box(1.9, 0.18, 1.0, body, 0, 0.32),
        box(0.7, 0.35, 0.8, dark, -0.25, 0.55),
        ...[[-0.7, 0.55], [0.7, 0.55], [-0.7, -0.55], [0.7, -0.55]].map(([x, z]) => cyl(0.24, 0.18, dark, x, 0.24, z)),
        box(0.34, 0.5, 0.38, light, -0.25, 0.95),
        new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), body).translateY(1.38).translateX(-0.25),
      ];
  }
  function roof(w: number, hgt: number, d: number, m: THREE.Material, y: number) {
    const g = new THREE.ConeGeometry(Math.max(w, d) * 0.75, hgt, 4);
    const o = new THREE.Mesh(g, m);
    o.rotation.y = Math.PI / 4;
    o.scale.set(w / (Math.max(w, d) * 1.06), 1, d / (Math.max(w, d) * 1.06));
    o.position.y = y;
    o.userData.y = y;
    return o;
  }
}

// ---------- audio: waveform from meta.peaks, playhead by age ----------

function AudioEv({ ev, age, w, h }: EvProps) {
  const peaks = meta<number[]>(ev, "peaks", []);
  const len = meta(ev, "durationMs", 4000) as number;
  const drawF = clamp01(age / 500);
  const head = clamp01(age / len);
  const n = peaks.length || 1, bw = (w - 60) / n;
  return (
    <svg width={w} height={h} style={fill}>
      {peaks.map((p, i) => {
        const x = 30 + i * bw, hh = p * (h * 0.6) * easeOut(clamp01(drawF * n / Math.max(1, i + 1) * 0.6));
        const played = i / n <= head;
        return <rect key={i} x={x} y={h / 2 - hh / 2} width={Math.max(1, bw * 0.6)} height={Math.max(1, hh)} rx={1} fill={played ? color.accent : color.dim} opacity={played ? 1 : 0.6} />;
      })}
      <line x1={30 + head * (w - 60)} x2={30 + head * (w - 60)} y1={h * 0.12} y2={h * 0.88} stroke={color.text} strokeWidth={2} />
    </svg>
  );
}

// ---------- chart: history, forecast + band, anomaly markers ----------

function ChartEv({ ev, age, w, h, beatMs }: EvProps) {
  const hist = meta<number[]>(ev, "history", []);
  const fc = meta<number[]>(ev, "forecast", []);
  const band = meta<[number, number][]>(ev, "band", []);
  const an = meta<number[]>(ev, "anomalies", []);
  const all = [...hist, ...fc, ...band.flat()];
  const lo = Math.min(...all), hi = Math.max(...all);
  const N = hist.length + fc.length;
  const px = (i: number) => 60 + (i / Math.max(1, N - 1)) * (w - 120);
  const py = (v: number) => h - 60 - ((v - lo) / (hi - lo || 1)) * (h - 140);
  const histF = clamp01(age / (meta(ev, "drawBeats", 2) * beatMs));
  const fcF = clamp01((age - meta(ev, "drawBeats", 2) * beatMs) / (2 * beatMs));
  const hn = Math.max(1, Math.round(histF * hist.length));
  const fn = Math.round(fcF * fc.length);
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const histPts = hist.slice(0, hn).map((v, i) => [px(i), py(v)] as [number, number]);
  const fcPts = fn ? [[px(hist.length - 1), py(hist[hist.length - 1])] as [number, number], ...fc.slice(0, fn).map((v, i) => [px(hist.length + i), py(v)] as [number, number])] : [];
  const bandPts = band.slice(0, fn);
  const bandPath = bandPts.length
    ? path([...bandPts.map(([, u], i) => [px(hist.length + i), py(u)] as [number, number]), ...bandPts.map(([l], i) => [px(hist.length + i), py(l)] as [number, number]).reverse()]) + "Z"
    : "";
  const anStart = meta(ev, "anomalyAt", 0) as number;
  return (
    <svg width={w} height={h} style={fill}>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={60} x2={w - 60} y1={60 + f * (h - 140)} y2={60 + f * (h - 140)} stroke={color.line} />)}
      <line x1={60} x2={w - 60} y1={h - 60} y2={h - 60} stroke={color.lineStrong} />
      {bandPath ? <path d={bandPath} fill={hexAlpha(color.accent, 0.16)} stroke="none" /> : null}
      <path d={path(histPts)} fill="none" stroke={color.text} strokeWidth={3} strokeLinejoin="round" />
      {fcPts.length ? <path d={path(fcPts)} fill="none" stroke={color.accent} strokeWidth={3} strokeDasharray="10 8" /> : null}
      {an.map((i, k) => {
        const f = clamp01((age - anStart - k * beatMs) / 120);
        if (f <= 0 || i >= hist.length) return null;
        const r = 10 + (1 - f) * 18;
        return (
          <g key={k} opacity={f}>
            <circle cx={px(i)} cy={py(hist[i])} r={r} fill="none" stroke={color.hit} strokeWidth={3} />
            <circle cx={px(i)} cy={py(hist[i])} r={5} fill={color.hit} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------- doc: page stack, vector drawing (meta.lines), or a grid of guides (meta.guides) ----------

function DocEv({ ev, age, url, w, h, beatMs }: EvProps) {
  const lines = meta<[number, number, number, number][]>(ev, "lines", []);
  if (lines.length) {
    // a drawing: one line per 8th note, coordinates in a 1000 x 700 sheet
    const per = meta(ev, "lineBeats", 0.125) as number;
    const s = Math.min(w / 1100, h / 780);
    return (
      <svg width={w} height={h} style={{ ...fill, background: "#070a12" }}>
        <g transform={`translate(${(w - 1000 * s) / 2},${(h - 700 * s) / 2}) scale(${s})`}>
          {Array.from({ length: 21 }, (_, i) => <line key={"v" + i} x1={i * 50} x2={i * 50} y1={0} y2={700} stroke={hexAlpha(color.accent, 0.06)} />)}
          {Array.from({ length: 15 }, (_, i) => <line key={"h" + i} y1={i * 50} y2={i * 50} x1={0} x2={1000} stroke={hexAlpha(color.accent, 0.06)} />)}
          {lines.map(([x1, y1, x2, y2], i) => {
            const f = clamp01((age - i * per * beatMs) / (per * beatMs));
            if (f <= 0) return null;
            return <line key={i} x1={x1} y1={y1} x2={x1 + (x2 - x1) * f} y2={y1 + (y2 - y1) * f} stroke={color.accent} strokeWidth={i < 4 ? 6 : 3} strokeLinecap="round" />;
          })}
        </g>
      </svg>
    );
  }
  const guides = meta(ev, "guides", 0) as number;
  if (guides) {
    const cols = guides <= 1 ? 1 : guides <= 8 ? guides : Math.ceil(Math.sqrt(guides * (w / h)));
    const rows = Math.ceil(guides / cols);
    const gw = Math.min((w - 80) / cols, ((h - 80) / rows) * 0.75) - 12, gh = gw / 0.75;
    return (
      <div style={{ ...fill, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 12, padding: 40 }}>
        {Array.from({ length: guides }, (_, i) => {
          const d = (i / guides) * 200, f = age < d ? 0 : clamp01(0.45 + (age - d) / 160);
          return (
            <div key={i} style={{ width: gw, height: gh, background: "#F4F6FA", borderRadius: 6, opacity: f, transform: `translateY(${(1 - f) * 20}px)`, padding: gw * 0.08, boxSizing: "border-box" }}>
              <div style={{ height: gh * 0.08, width: "70%", background: color.accent, borderRadius: 2 }} />
              {Array.from({ length: 7 }, (_, k) => <div key={k} style={{ height: Math.max(1, gh * 0.025), width: `${90 - ((k * 37) % 30)}%`, background: "#AEB6C6", marginTop: gh * 0.05, borderRadius: 1 }} />)}
            </div>
          );
        })}
      </div>
    );
  }
  const pages = meta<string[]>(ev, "pages", [ev.uri]);
  const n = pages.length;
  return (
    <div style={fill}>
      {pages.map((p, i) => {
        const f = easeOut(clamp01((age - i * (beatMs / 2)) / 300));
        const spread = (i - (n - 1) / 2) * Math.min(160, (w - 400) / Math.max(1, n));
        return (
          <img key={i} src={url(p)} alt="" draggable={false}
            style={{ position: "absolute", left: "50%", top: "50%", height: h * 0.7, opacity: f, borderRadius: 8,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              transform: `translate(-50%,-50%) translateX(${spread * f}px) rotate(${(i - (n - 1) / 2) * 4 * f}deg)` }} />
        );
      })}
    </div>
  );
}

// ---------- code: a diff with a glint sweeping across ----------

function CodeEv({ ev, age, w, h }: EvProps) {
  const lines = meta<[string, string][]>(ev, "lines", [[" ", ev.caption ?? ev.uri]]);
  const glint = ((age % 1400) / 1400) * (w + 400) - 200;
  const shown = Math.min(lines.length, Math.floor(age / 45) + 1);
  return (
    <div style={{ ...fill, background: "#070910", padding: "28px 34px", boxSizing: "border-box", font: `400 19px/1.55 ${font.mono}`, color: color.text, whiteSpace: "pre" }}>
      {lines.slice(0, shown).map(([op, text], i) => (
        <div key={i} style={{ color: op === "+" ? color.ok : op === "-" ? color.hit : color.dim, background: op === "+" ? hexAlpha(color.ok, 0.07) : op === "-" ? hexAlpha(color.hit, 0.07) : "transparent" }}>
          {op} {text}
        </div>
      ))}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: glint, width: 120, background: `linear-gradient(90deg, transparent, ${hexAlpha(color.accent, 0.18)}, transparent)`, transform: "skewX(-18deg)" }} />
    </div>
  );
}

// ---------- link: browser frame, build bar, URL typing out, page loads ----------

function LinkEv({ ev, age, url, w, h, beatMs, mode }: EvProps) {
  const href = meta(ev, "url", ev.uri) as string;
  const buildF = clamp01(age / (meta(ev, "buildBeats", 1.5) * beatMs));
  const typeAt = meta(ev, "buildBeats", 1.5) * beatMs;
  const chars = Math.max(0, Math.min(href.length, Math.floor((age - typeAt) / 28)));
  const loadF = clamp01((age - typeAt - href.length * 28) / 300);
  const frames = meta<string[]>(ev, "frames", []);
  const shot = meta<string | null>(ev, "shot", null);
  return (
    <div style={{ ...fill, background: color.bg }}>
      <div style={{ position: "absolute", left: 40, right: 40, top: 30, height: 8, borderRadius: 4, background: color.line }}>
        <div style={{ width: `${buildF * 100}%`, height: "100%", borderRadius: 4, background: buildF >= 1 ? color.ok : color.accent }} />
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 60, bottom: 30, borderRadius: size.radius, border: `1px solid ${color.lineStrong}`, overflow: "hidden", background: color.panel }}>
        <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: `1px solid ${color.line}` }}>
          {[color.hit, color.dim, color.ok].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.7 }} />)}
          <div style={{ flex: 1, marginLeft: 12, height: 32, borderRadius: 16, background: color.bg, display: "flex", alignItems: "center", padding: "0 16px", font: `500 17px ${font.mono}`, color: color.text }}>
            {href.slice(0, chars)}
            {chars < href.length && age > typeAt ? <span style={{ width: 2, height: 20, background: color.accent, marginLeft: 2 }} /> : null}
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 53, bottom: 0, opacity: loadF }}>
          {frames.length ? <FrameClip frames={frames} fps={meta(ev, "fps", 8)} age={age - typeAt} url={url} mode={mode} /> : shot ? <img src={url(shot)} style={{ ...fill, objectFit: "cover" }} alt="" /> : null}
        </div>
      </div>
    </div>
  );
}

/** Small preview used inside cells and wall tiles. */
export function Thumb({ ev, url, w, h }: { ev: EvidenceRec; url: (u: string) => string; w: number; h: number }) {
  const src = useMemo(() => {
    if (ev.thumb) return url(ev.thumb);
    if (ev.kind === "image") return url(ev.uri);
    const m = ev.meta ?? {};
    const f = (m.frames as string[] | undefined)?.[0] ?? (m.shot as string | undefined) ?? (m.pages as string[] | undefined)?.[0];
    return f ? url(f) : null;
  }, [ev, url]);
  if (!src) return null;
  return <img src={src} alt="" draggable={false} style={{ width: w, height: h, objectFit: "cover", borderRadius: 6, display: "block" }} />;
}
