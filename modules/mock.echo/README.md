# mock.echo

Test module. Writes the prompt to `echo.txt` in the cell folder and attaches it as `doc` evidence.
No worker, no network (`allow.write` is only `$NODE`).

Mock: `fixtures/default.jsonl`, recorded from a real run with
`pnpm fixture <runId> <nodeId> mock.echo`. Replayed when `HARNESS_MOCK=1`.
