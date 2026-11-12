---
name: cf-201-exclude-is-per-clone
description: CF-201 keys "excluded project" on the clone-local info/exclude while migration is a repo-wide commit; check every reader of boardExcluded/fleet-exclude status for a fresh or second clone
metadata:
  type: project
---

CF-201 (round 1 reviewed 2026-11-12 at ac580d67) keeps the board, fleet memory, installed rules, `.claude/coder-fleet.json`, `docs/specs/` and `docs/runs/` out of history through `.git/info/exclude`, written by `scripts/fleet-exclude.py`, and pushes `coder-fleet/state` with `hooks/state-push.sh` (shares `hooks/lib/remote-guard.sh` with CF-200's fast-forward). Settled by the human on the card: always exclude, no question; those six paths; /init migrates with one commit; push the state branch automatically.

The trap raised in round 1: `info/exclude` is never committed, so it exists only in clones where /init ran, but the migration commit (and the removal of the old `.gitignore` lines) reaches every clone. `flush.ts` `boardExcluded` reads the local file, so a fresh clone (the very case criterion 9 serves) or a second machine falls into the old flush, which lands board and memory on main again; and since CF-198's carry only keeps paths the tip's committed `.gitignore` ignores, after migration a restart drops every card the state branch did not change since the last flush.

**Why:** a per-clone signal standing in for a per-repo fact.

Round 2 (2026-11-12 at 2c646827) settled it by removing the fork, on the lead's ruling from "always, no choice": `board flush` lands nothing in any project, prints one `nothing lands on` line (naming /coder-fleet:init when the default tip still tracks `.boards` or fleet memory) and pushes the state branch; the CF-198 carry, restart and HELD_REF went with it; `migrate()`'s auto adoption from the fetch remote runs `fleet-exclude.py write`. `stageUnexcluded` and `board-git-check.sh` now drop only the fleet's `.boards` entry from info/exclude. Don't re-raise the flush fork. Left open as Low: `restoreStateFrom` (`board state --from`) adopting with no local branch writes no exclude, and board-git-check's printed fix is still `add -f`.

**How to apply:** in later rounds of CF-201, check the fix keys on something every clone shares (the default branch tip not tracking `.boards`, or a committed marker), or that adoption from the remote writes the exclude, and that a test flushes from a clone with no exclude. Related: [[ignored-memory-rule-and-flush]], [[cf-198-ignored-root-carry]], [[cf-200-session-start-fast-forward]].
