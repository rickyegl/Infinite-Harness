# For every agent working in this repo

1. Read `plan/00-contract.md` first, then `plan/STATUS.md` and `plan/LOCAL.md`.
2. **Every commit message ends with the co-author trailer written in `plan/LOCAL.md` under "Commit trailer".**
   This holds for every commit, whichever tool or model made the change. `plan/LOCAL.md` is not in git: if it
   is missing (a fresh clone or a worktree), ask the author for the trailer line. Do not commit without it.
3. No vendor or model names in code, UI, docs or file names. The commit trailer is the only exception.
4. Never print, log or commit keys or tokens.
