import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The stage runs with no backend: these folders are served read-only next to the app.
//   /video/...     -> <repo>/video      (timeline.json, direction/, takes/)
//   /fixtures/...  -> apps/web/fixtures (hand-written fixture events + placeholder artifacts)
//   /runs/...      -> <repo>/runs       (real runs, once the bridge writes them)
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const MOUNTS: [string, string][] = [
  ["/video/", join(repo, "video")],
  ["/fixtures/", join(here, "fixtures")],
  ["/runs/", join(repo, "runs")],
];
const TYPES: Record<string, string> = {
  ".json": "application/json", ".jsonl": "application/x-ndjson", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".mp4": "video/mp4", ".webm": "video/webm",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".txt": "text/plain", ".diff": "text/plain", ".md": "text/plain",
  ".dxf": "text/plain",
};

const serveFolders = (): Connect.NextHandleFunction => (req, res, next) => {
  const url = decodeURIComponent((req.url ?? "").split("?")[0]);
  const mount = MOUNTS.find(([p]) => url.startsWith(p));
  if (!mount) return next();
  const file = normalize(join(mount[1], url.slice(mount[0].length)));
  // dotfiles (the bridge's pairing token lives at runs/.bridge-token) are never served
  if (!file.startsWith(mount[1]) || url.split("/").some((p) => p.startsWith("."))) { res.statusCode = 403; return res.end(); }
  if (!existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "no-cache");
  createReadStream(file).pipe(res);
};

const folders = (): Plugin => ({
  name: "harness-folders",
  configureServer: (s) => { s.middlewares.use(serveFolders()); },
  configurePreviewServer: (s) => { s.middlewares.use(serveFolders()); },
});

export default defineConfig({
  plugins: [react(), folders()],
  server: { port: 5173, host: "127.0.0.1" },
});
