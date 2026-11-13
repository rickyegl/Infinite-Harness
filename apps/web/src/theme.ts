// Design tokens. Components read colours, type and sizes from here only (plan 01, step 3).

export const color = {
  bg: "#05060A",
  panel: "#0B0D14",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.18)",
  text: "#E8ECF4",
  dim: "#7A8499",
  accent: "#3DF2FF",
  hit: "#FF2E63",
  ok: "#4CFFA6",
  black: "#000000",
  white: "#FFFFFF",
} as const;

export const font = {
  ui: "'Grotesk', system-ui, sans-serif",
  mono: "'Mono', ui-monospace, monospace",
} as const;

export const size = {
  radius: 14,
  hairline: 1,
  /** the film frame; the stage is laid out at this size and scaled to the window */
  stageW: 1920,
  stageH: 1080,
  cellW: 172,
  cellH: 60,
  rootW: 220,
  rootH: 72,
  badge: 18,
} as const;

/** glow = accent at 35% opacity, 24 px blur */
export const glow = (c: string = color.accent, alpha = 0.35, blur = 24) =>
  `0 0 ${blur}px ${hexAlpha(c, alpha)}`;

export function hexAlpha(hex: string, a: number): string {
  if (!hex.startsWith("#")) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const stateColor = {
  queued: color.dim,
  running: color.accent,
  waiting: color.dim,
  done: color.ok,
  failed: color.hit,
} as const;
