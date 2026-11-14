// Where a rider sits in a generated kart, read from the kart's OBJ vertices (the same method as Models.Seat in the
// Unity game). Roblox cannot read the vertices of an inserted model, so the orchestrator works the seat out here
// and writes it into Config.models.kart as fractions of the kart's bounds.

import { existsSync, readFileSync } from "node:fs";

/** y: seat height above the kart's bottom, as a share of its height; back: seat distance behind its front, as a
 *  share of its length. The OBJ faces +Z (its front is max z) with y up. */
export type Seat = { y: number; back: number };

export function seatOf(objFile: string): Seat | null {
  if (!existsSync(objFile)) return null;
  const pts: [number, number, number][] = [];
  for (const line of readFileSync(objFile, "utf8").split("\n")) {
    if (!line.startsWith("v ")) continue;
    const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
    if ([x, y, z].every(Number.isFinite)) pts.push([x, y, z]);
  }
  if (pts.length < 8) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) [min[i], max[i]] = [Math.min(min[i], p[i]), Math.max(max[i], p[i])];
  const size = max.map((v, i) => v - min[i]);
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  if (size[1] <= 0 || size[2] <= 0) return null;

  // the cockpit: the lowest cell top in the middle third across, between the rear and just past the middle
  const G = 6;
  const [x0, x1] = [cx - size[0] / 6, cx + size[0] / 6];
  const [z0, z1] = [min[2] + size[2] * 0.12, cz + size[2] * 0.08];
  const top: number[][] = Array.from({ length: G }, () => Array(G).fill(-Infinity));
  for (const [x, y, z] of pts) {
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    const ix = Math.min(G - 1, Math.floor(((x - x0) / (x1 - x0)) * G));
    const iz = Math.min(G - 1, Math.floor(((z - z0) / (z1 - z0)) * G));
    top[ix][iz] = Math.max(top[ix][iz], y);
  }
  let best = Infinity;
  let bz = cz;
  for (let a = 1; a < G - 1; a++)
    for (let c = 0; c < G; c++)
      if (top[a][c] > -Infinity && top[a][c] < best) [best, bz] = [top[a][c], z0 + ((c + 0.5) / G) * (z1 - z0)];
  if (best === Infinity) return null;
  const y = Math.min(0.75, Math.max(0.2, (best - min[1]) / size[1]));
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { y: round(y), back: round((max[2] - bz) / size[2]) };
}
