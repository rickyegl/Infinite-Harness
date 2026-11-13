# game.relay

Live follow-up: "add crossplay". It opens a room on the bridge's relay (`/relay/<run id>`; see
`apps/bridge/src/relay.ts`) and checks both directions in a side room: a WebSocket for the Unity build and an HTTP
POST for a Roblox server. Then it turns on the `relay` flag. The running Unity build and the Roblox place post
their karts' progress, and each draws the other engine's karts as named ghosts. A stand-in Roblox kart proves the
ghost path in a short capture of the Unity game.
