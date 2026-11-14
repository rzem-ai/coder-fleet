---
name: trunk-readers-traps
description: Moving a reader onto fleet_trunk - config text never reaches session or deny text, contract GATE and fixture traps, review-round's resolver lane
metadata:
  type: feedback
---

Learned on CF-209.2 (2026-11-14), moving the trunk readers onto `fleet_trunk`.

- `.claude/coder-fleet.json` is committed in a project, so a clone chooses its text. The lead sent a mid-build fix: nothing built from the file (the resolver's `FLEET_TRUNK_REASON` quotes `baseBranch`) may reach SessionStart context, a deny reason or a workflow error. Use a fixed sentence and send the reason to the hook log; only a name that passed the resolver's name check may appear.
- `prune-worktrees-contract.sh` has `GATE=1` mid-file, so a check on a non-zero exit fails however right it is. Wrap such checks in `GATE=0` ... `GATE=1`.
- The resolver reads only a remote `git remote` lists. An old fixture that plants `refs/remotes/origin/HEAD` with no origin remote needs `git remote add origin https://example.invalid/x.git`. A fixture that copies a script into a fake plugin needs `hooks/lib/fleet-config.sh` and `.py` copied beside it.
- review-round cannot run git, so its lane runs `scripts/fleet-trunk.sh` (found like the board shim) and the script checks the answer against its own `baseOf`. JS and fleet-config.py agree on shape only; `bad..x` is ok to both and refused by the resolver's git check, so with `baseBranch` set, an empty lane answer means the resolver refused it.
- In the scope hook, steward cases run from `$PROJECT`, which is not a repository: there, keep main/master only, and refuse when inside a repository the trunk will not resolve.

**Why:** each cost a round on CF-209.2. **How to apply:** any later card that reads `baseBranch`, `push` or `release` (CF-209.3 to .5). Related: [[scope-hook-test-traps]], [[git-hook-testing-and-trust]].
