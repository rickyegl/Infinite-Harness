# Hosted

- No browser build in this run.
- Crossplay relay: https://bend-residential-visits-lounge.trycloudflare.com/relay/20261113-224654 (POST a state, get the others back; WebSocket on the same path)
- Tunnel: quick tunnel https://bend-residential-visits-lounge.trycloudflare.com to http://127.0.0.1:7411. It closes when the run is cancelled, when the bridge stops, or on `pnpm stop`.
