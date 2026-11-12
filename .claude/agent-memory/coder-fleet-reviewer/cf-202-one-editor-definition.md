---
name: cf-202-one-editor-definition
description: CF-202 editor decisions, the retired-types deny the human later dropped (PR 180), and the break-mode harness that worked in coder-fleet
metadata:
  type: project
---

CF-202 (2026-11-13) dropped the Fable editors and put `spec-editor-fable|tech-editor-fable` in enforce-agent-scope.sh's retired-types deny beside refuter/evaluator. The same day the human's direct commit 4cab3168 deleted that whole retired-types block and /init step 2c (the editor question), and when asked chose to drop the protection: no deny for retired or unknown fleet types, no revert. PR 180 removed the matching contract section and hooks README paragraph. Still settled: `editor-models.py set` leaves stale `Agent(coder-fleet:*-fable)` deny rules alone; challenge-gate refuses a recorded `fable` as `bad-record`.

**Why:** the human decided the retired-type deny was not worth keeping; do not re-raise its absence as a finding.

**How to apply:** after 4cab3168, a doc saying the Claude Code hook refuses retired types is stale (the OpenCode port's own RETIRED_AGENTS is separate and still live). kickoff.md preflight 8 pointed at init step 2c after it was gone; check whether a later change fixed that. Break-mode harness that worked: `git archive` is refused, so copy the worktree with `rsync -a --exclude node_modules --exclude .git` into the scratchpad; scope-hook-contract, editor-models-contract and challenge-gate-contract all run green there without git or node_modules. See [[gate-run-quirks]].
