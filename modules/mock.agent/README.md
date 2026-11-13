# mock.agent

Test module. Runs a real headless worker with only the harness MCP tools. The worker calls
`report_step`, then `spawn_task` three times; every child is a sub-worker (same `allow`, no further
spawning) that writes `answer.txt` and calls `attach_evidence`. This is the end-to-end check that tool
calls become steps and that spawned children appear as cells.

Mock: `fixtures/default.jsonl`, recorded from a real run with
`pnpm fixture <runId> <nodeId> mock.agent`. Replayed when `HARNESS_MOCK=1`.
