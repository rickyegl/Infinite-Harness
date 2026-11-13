# For every agent working in this repo

1. Read `plan/00-contract.md` first, then `plan/STATUS.md` and `plan/LOCAL.md`.
2. **Every commit message ends with the co-author trailer written in `plan/LOCAL.md` under "Commit trailer".**
   This holds for every commit, whichever tool or model made the change. `plan/LOCAL.md` is not in git: if it
   is missing (a fresh clone or a worktree), ask the author for the trailer line. Do not commit without it.
3. No vendor or model names in code, UI, docs or file names. Two exceptions: the commit trailer, and the maker
   icons of non-LLM generators (the `maker` field and `apps/web/public/makers/`; see "Maker icons" in the
   contract). LLM vendors are never shown or named.
4. Never print, log or commit keys or tokens.
5. **You may stop and ask the author.** If the real work needs the author now, stop and ask instead of guessing
   or working around it. That covers: a program that must be opened (Unity, Roblox Studio, the model proxy), an
   API or sign-in, the Colab runtime that must be started or connected, a question nobody has answered, or any
   other blocker.
   - Ask in one message: the exact action or question, what it unblocks, and what you will do once it is done.
   - Also write it under "Waiting on the author" in `plan/STATUS.md`, and remove the line when it is answered.
     If you cannot wait for a reply in your session, end your turn with the question as your last output.
   - Do not replace the real thing with a mock and report it as done.
   - Slow items (an install, a recording) still go in `plan/USER-TODO.md`; carry on with other work meanwhile.
   - The approvals in the contract and in `plan/USER-TODO.md` (publishing, uploads, voice credits, making the
     repo public) are unchanged: always ask for those.
