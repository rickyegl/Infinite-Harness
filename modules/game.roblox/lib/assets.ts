// Generated 3D models as Roblox assets. The place loads each model with InsertService from an asset id, so every
// model.glb is uploaded once as a Model asset on the author's account (each upload batch needs the author's
// go-ahead). runs/.cache/roblox-assets.json maps a GLB's sha256 to its asset id: the same model is never uploaded
// twice, and a rebuild with the same design finds its ids. A slot without an id stays part-built.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ASSET_MAP = join(REPO, "runs", ".cache", "roblox-assets.json");
/** the one folder the author approves for uploads: every model still waiting is copied here as <slot>-<sha8>.glb */
export const UPLOAD_DIR = join(REPO, "runs", ".cache", "roblox-upload");

export type AssetEntry = { id: number; slot: string; prompt?: string; uploaded: string; yaw?: number };

export function readAssetMap(): Record<string, AssetEntry> {
  try {
    return existsSync(ASSET_MAP) ? JSON.parse(readFileSync(ASSET_MAP, "utf8")) : {};
  } catch {
    return {};
  }
}

export function recordAsset(sha: string, entry: AssetEntry): void {
  const map = readAssetMap();
  map[sha] = entry;
  mkdirSync(dirname(ASSET_MAP), { recursive: true });
  writeFileSync(ASSET_MAP, JSON.stringify(map, null, 1));
}

export const fileHash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** for each model slot (slot -> run-relative uri of its model.glb): its asset id, or the file still to upload */
export function modelAssets(runDir: string, models: Record<string, string>) {
  const map = readAssetMap();
  const ids: Record<string, { id: number; yaw: number }> = {};
  const waiting: { slot: string; glb: string; sha: string }[] = [];
  for (const [slot, uri] of Object.entries(models)) {
    const glb = join(runDir, uri);
    if (!existsSync(glb) || !/\.glb$/i.test(glb)) continue;
    const sha = fileHash(glb);
    const hit = map[sha];
    if (hit?.id) ids[slot] = { id: hit.id, yaw: hit.yaw ?? 0 };
    else {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      const staged = join(UPLOAD_DIR, `${slot}-${sha.slice(0, 8)}.glb`);
      if (!existsSync(staged)) copyFileSync(glb, staged);
      waiting.push({ slot, glb: staged, sha });
    }
  }
  return { ids, waiting };
}
