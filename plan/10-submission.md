# 10. Submission polish

**Goal:** a judge can open the repo, understand it in a minute, watch the film, try the site in replay mode and
run it locally.

**Read first:** [00-contract.md](00-contract.md), `plan/STATUS.md`.

## Build

1. **README.md**: one-paragraph pitch, the film (link or embedded gif of Act 2), a diagram of
   prompt -> router -> module cells -> events -> stage, the module list by capability, "try it" (deployed site in
   replay mode; local run with mocks: `pnpm i && HARNESS_MOCK=1 pnpm dev`), "run it for real" (what must be
   installed and configured, pointing at `harness.config.example.json`), and the honesty sheet link ("what in
   the film is a real run").
2. **docs/**: `architecture.md` (the event protocol, UI = f(events, t), record and replay),
   `modules.md` (generated from `modules/*/module.json`), `film.md` (how the film is produced from takes),
   `safety.md` (pairing token, localhost binding, what the harness will not do without approval: publish,
   upload, spend).
3. **Clean-up.** Remove dead fixtures and stray files; make sure `.gitignore`d things are not tracked
   (`git ls-files` against the ignore list); run the brand lint across the whole repo including docs and
   committed takes (it skips only the `maker` values and `apps/web/public/makers/`, see the contract); confirm no keys, tokens, e-mail addresses, course data or absolute machine paths are
   committed (`git grep` for drive letters, `@`, `key`, `token`).
4. **Licence and credits.** Add a licence the author picks. Credits list engines and partner tools by name;
   model providers stay unnamed ("Built with AI"). The maker icons in the graph are the one exception and
   stay icons: do not add their names to the README or docs.
5. **Fresh-clone test.** Clone into a temp folder, `pnpm i`, `HARNESS_MOCK=1 pnpm dev`, run the Act 1 prompt,
   watch the mock graph, open replay mode. Fix whatever a stranger would trip on.
6. **Repo visibility.** The repo is private. Making it public is the author's call: ask, do not do it.

## Done when

- Fresh-clone test passes on this machine in a clean folder.
- `pnpm lint && pnpm test` pass.
- README renders correctly on the repo page and every link in it resolves.
- `STATUS.md` has the final state and the list of things knowingly left undone.
