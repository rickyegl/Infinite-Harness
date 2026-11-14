# approve

The author's go on a script that waits at a reel's gate (`_shared/gate.ts`): "go", "approved", "looks good,
voice it". It runs as a follow-up under the cell it approves, or under a campaign above two reels.

- It approves only scripts waiting in its parent's subtree. When several wait and the prompt does not name one
  ("the explainer", "the premise", "the Roblox one") or say "both" / "all", it approves none and lists them:
  each script gets its own go.
- The go is bound to the script's text (a hash of `script.txt` as it reads it now). Editing the script after the
  go makes the go stale and the cell keeps waiting.
- **Evidence:** the approved script as a page.
