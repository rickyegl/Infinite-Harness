// Generated 3D models as Roblox assets. The place loads each model with InsertService from an asset id, so every
// model.glb is uploaded once as a Model asset on the author's account (each upload batch needs the author's
// go-ahead). runs/.cache/roblox-assets.json maps a GLB's sha256 to its asset id: the same model is never uploaded
// twice, and a rebuild with the same design finds its ids. A slot without an id stays part-built.
// Banner pictures work the same way (uploaded as Decals; the map keeps the image id a Decal.Texture needs).

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const ASSET_MAP = join(REPO, "runs", ".cache", "roblox-assets.json");
/** the one folder the author approves for uploads: every model still waiting is copied here as <slot>-<sha8>.glb */
export const UPLOAD_DIR = join(REPO, "runs", ".cache", "roblox-upload");

/**
 * A model: `id` is the Model asset. A picture (`kind: "image"`): uploaded as a Decal (`decal`), and `id` is the
 * image the decal points at, which is what a Decal.Texture needs (read in Studio with InsertService:LoadAsset).
 */
export type AssetEntry = { id: number; slot: string; prompt?: string; uploaded: string; yaw?: number; kind?: "image"; decal?: number };

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

/**
 * For the design's banner pictures (name -> run-relative uri): the image ids already uploaded, in design order,
 * and the pictures still to upload (staged in UPLOAD_DIR as banner-<name>-<sha8>.<ext>, like the models).
 */
export function pictureAssets(runDir: string, pictures: { name: string; uri: string }[]) {
  const map = readAssetMap();
  const ids: number[] = [];
  const waiting: { slot: string; file: string; sha: string }[] = [];
  for (const { name, uri } of pictures) {
    const file = join(runDir, uri);
    if (!existsSync(file) || !/\.(png|jpe?g)$/i.test(file)) continue;
    const sha = fileHash(file);
    const slot = `banner.${name.replace(/[^\w-]+/g, "-").toLowerCase()}`;
    const hit = map[sha];
    if (hit?.id && hit.kind === "image") ids.push(hit.id);
    else {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      const staged = join(UPLOAD_DIR, `${slot}-${sha.slice(0, 8)}${file.slice(file.lastIndexOf(".")).toLowerCase()}`);
      if (!existsSync(staged)) copyFileSync(file, staged);
      waiting.push({ slot, file: staged, sha });
    }
  }
  return { ids, waiting };
}
