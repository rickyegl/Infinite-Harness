# host

"Put it online": the run's browser build at a public address, the crossplay relay on the same address, and a
Roblox place ready to publish.

1. **The build:** `params.dir`, the Unity WebGL build in the run's game state, or `artifacts/webgl/`. The bridge
   serves it without the token at `/runs/<id>/<path>/`, with `Content-Encoding` on Unity's `.gz`/`.br` files.
2. **The tunnel:** a quick tunnel in front of the bridge (`cloudflared`, `paths.cloudflared`). It belongs to
   the run: it closes when the run is cancelled, when the bridge stops, or on `pnpm stop`.
3. **From outside:** it waits until the new address answers 200 (resolved over DNS-over-HTTPS), then opens it in
   a headless browser and waits for a picture.
4. **The relay:** `<address>/relay/<run>` goes into the run's game state and into the Roblox place's
   `Flags.luau` (and the open Studio place).
5. **Roblox:** publishing the place always waits for the author's approval, so the cell publishes a "ready to
   publish" note and records a short play test in Studio instead (skipped when Studio is not open).

- **Outputs:** "Play in browser" (a link to the public address), "Roblox: ready to publish". Evidence: the page
  through the public address, the Studio play test, the addresses.
- Test: `pnpm test:host` (a throwaway run with a small canvas page, over the real network, about 30 s).
