// Line icons, drawn here so nothing is fetched. 24x24 grid, stroke only, colour from currentColor.

import type { CSSProperties } from "react";

const P: Record<string, string> = {
  spark: "M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4",
  game: "M6 9h12a4 4 0 0 1 0 8c-2 0-3-2-6-2s-4 2-6 2a4 4 0 0 1 0-8zM8 11v4M6 13h4M16 12h.01M18 14h.01",
  cube: "M12 2l9 5v10l-9 5-9-5V7zM12 22V12M21 7l-9 5-9-5",
  agent: "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c0-4 4-6 8-6s8 2 8 6",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01",
  film: "M3 4h18v16H3zM7 4v16M17 4v16M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4",
  megaphone: "M3 10v4h4l8 5V5L7 10zM18 9a3 3 0 0 1 0 6",
  wave: "M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h-2",
  globe: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zM2 12h20M12 2c3 3 4 6 4 10s-1 7-4 10c-3-3-4-6-4-10s1-7 4-10z",
  record: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  check: "M4 12l5 5L20 6",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  scissors: "M6 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 14a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8.5 8.5L20 20M8.5 15.5L20 4",
  ruler: "M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
  camera: "M3 7h4l2-3h6l2 3h4v13H3zM12 10a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
  book: "M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6M20 4v14h-6",
  cog: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1",
  chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  chart: "M3 20h18M5 16l4-5 4 3 6-8",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  sun: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12 1v2M12 21v2M1 12h2M21 12h2M4 4l1.5 1.5M18.5 18.5L20 20M20 4l-1.5 1.5M5.5 18.5L4 20",
  code: "M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16",
  doc: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6",
  box: "M4 4h16v16H4z",
  play: "M7 4l13 8-13 8z",
  road: "M8 2L4 22M16 2l4 20M12 4v3M12 11v3M12 18v3",
  sword: "M14 4l6-1-1 6-9 9-5-5zM5 14l-2 6 6-2M8 16l-3 3",
  person: "M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 22l1-9-3-3h12l-3 3 1 9M9 13h6",
  layout: "M3 3h18v18H3zM3 9h18M9 9v12",
  hammer: "M14 4l6 6-3 3-6-6zM11 7L3 15l3 3 8-8",
  pencil: "M4 20l4-1L20 7l-3-3L5 16zM15 6l3 3",
  robot: "M6 8h12v10H6zM12 4v4M9 12h.01M15 12h.01M9 15h6M3 12h3M18 12h3",
  house: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6",
  rig: "M12 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 7v7M12 14l-4 6M12 14l4 6M6 10h12",
  dot: "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
};

/** Module id (or prefix) -> icon. Exact match first, then the longest prefix. */
const BY_MODULE: [string, string][] = [
  ["root", "spark"], ["game", "game"], ["unity", "cube"], ["roblox", "cube"], ["campaign", "megaphone"], ["game.design", "pencil"], ["game.unity", "cube"], ["game.roblox", "cube"],
  ["track", "road"], ["karts", "game"], ["combat", "sword"], ["humanoids", "person"], ["ui", "layout"],
  ["build", "hammer"], ["lighting", "moon"], ["relay", "link"], ["shaders", "sun"],
  ["trailer", "film"], ["campaign", "megaphone"], ["reel", "film"], ["voice", "wave"], ["music", "music"],
  ["host", "globe"], ["recorder", "record"], ["verifier", "check"], ["assets", "layers"],
  ["assets.image", "image"], ["assets.image.edit", "image"], ["assets.cutout", "scissors"],
  ["assets.model3d", "cube"], ["assets.rig", "rig"], ["assets.video", "film"], ["drafting", "ruler"],
  ["blender", "cube"], ["blender.render", "camera"], ["study", "book"], ["cad", "cog"], ["sim", "robot"],
  ["pcb", "chip"], ["forecast", "chart"], ["anomaly", "alert"],
];

export function iconFor(module: string, explicit?: string): string {
  if (explicit && P[explicit]) return explicit;
  const exact = BY_MODULE.find(([m]) => m === module);
  if (exact) return exact[1];
  const last = module.split(".").pop() ?? module;
  const tail = BY_MODULE.find(([m]) => m === last);
  if (tail) return tail[1];
  const pre = BY_MODULE.filter(([m]) => module.startsWith(m + ".")).sort((a, b) => b[0].length - a[0].length)[0];
  return pre ? pre[1] : "box";
}

export function Icon({ name, size = 20, style, strokeWidth = 1.6 }: { name: string; size?: number; style?: CSSProperties; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      <path d={P[name] ?? P.box} />
    </svg>
  );
}

/** Neutral glyph for a maker whose icon file is missing: a small hexagon with a dot. */
export function NeutralMaker({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
