# Crossplay relay

Room `20261113-014545` on the bridge.

- Unity builds connect over WebSocket: `ws://127.0.0.1:7411/relay/20261113-014545`
- The Roblox place's server posts its riders' states over HTTP: `POST http://127.0.0.1:7411/relay/20261113-014545` and gets everyone else's back.
- A state is `{id, eng, name, c, p, l, h, v, lap}`: track progress 0..1, lateral -1..1, heading, speed, lap.
- Other players show up as translucent ghost karts with a name tag. Nothing collides across engines.

Checked both ways before switching on: the WebSocket client received the HTTP sender's state, and the HTTP sender got the WebSocket client's state back.

Roblox servers cannot reach 127.0.0.1: point the place at a public tunnel to the bridge for real crossplay.
