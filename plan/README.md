# Build plan

Ordered plan files. Give them to one agent at a time, in order. Each file is self-contained once the agent has
also read `00-contract.md`.

| # | File | Result | Day |
|---|---|---|---|
| 00 | [00-contract.md](00-contract.md) | Shared design: layout, event protocol, module contract, rules. Not a task. | - |
| 01 | [01-ui-stage.md](01-ui-stage.md) | All eight views rendering from fixture events on a seekable clock, click-to-zoom, and a rough cut of the whole film. | 1 |
| 02 | [02-bridge-core.md](02-bridge-core.md) | Bridge, router, CLI workers, harness MCP, live mode, takes. | 1 |
| 03 | [03-game-agents.md](03-game-agents.md) | Game orchestrator, Unity and Roblox sub-orchestrators, live direction, crossplay. | 2 |
| 04 | [04-assets.md](04-assets.md) | Image, edit, cutout, 3D, video, voice, music, and handoff into the games. | 2 |
| 05 | [05-reels-and-campaign.md](05-reels-and-campaign.md) | Trailer, reels, motion graphics, campaign. | 2 |
| 06 | [06-host-verify-record.md](06-host-verify-record.md) | Public links, site online, Verifier, Recorder. | 2 |
| 07 | [07-long-tail-modules.md](07-long-tail-modules.md) | Act 5 modules: drafting, Blender, study, CAD, PCB, forecast, anomaly. | 3 |
| 08 | [08-capture-takes.md](08-capture-takes.md) | Real takes and direction files for every shot. | 3 |
| 09 | [09-film-assembly.md](09-film-assembly.md) | The final cut of the film. | 3 |
| 10 | [10-submission.md](10-submission.md) | README, docs, clean-up, fresh-clone test. | 3 |

Also here: [USER-TODO.md](USER-TODO.md) (things only the author can do, with when they block),
[STATUS.md](STATUS.md) (running state every agent updates), and `LOCAL.md` (gitignored: this machine's paths,
worker commands and where existing implementations live).

The film layout that all of this serves: [../video/SHOTS.md](../video/SHOTS.md).

## Prompt to hand an agent

```
Read plan/00-contract.md, plan/STATUS.md and plan/LOCAL.md, then implement plan/0N-<name>.md completely.
Do its "Verify first" items before writing code. Finish with its "Done when" checks passing, update
plan/STATUS.md and the docs, then commit and push.
```

## Order and overlap

Strictly in order is safe. With two agents at once: 01 and 02 can overlap after 01 has committed
`packages/protocol`; 04 and 05 can overlap; 07 can start any time after 02. Two agents must never edit the same
module folder or `packages/protocol` at the same time.

## If time runs out

Three days is tight for eleven files. The cut order is in the contract (rule 4). The minimum film is: Act 1,
Act 2 on a real `main` take, Act 3 with at least night and realistic real, Act 5 with the image chain, CAD and
forecast real and the rest on mock (declared in the honesty sheet), Acts 6-7.
