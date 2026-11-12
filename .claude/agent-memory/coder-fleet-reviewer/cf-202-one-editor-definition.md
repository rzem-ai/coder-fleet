---
name: cf-202-one-editor-definition
description: CF-202 settled decisions (fable names in the retired-types deny, leftover -fable deny rules kept) and the break-mode harness that worked in coder-fleet
metadata:
  type: project
---

CF-202 (2026-11-13) dropped the Fable editors. Settled by the lead, not to relitigate: `spec-editor-fable|tech-editor-fable` sit in enforce-agent-scope.sh's retired-types deny beside refuter/evaluator, with the final `*) allow` left alone; `editor-models.py set` leaves stale `Agent(coder-fleet:*-fable)` deny rules alone; challenge-gate refuses a recorded `fable` as `bad-record`.

**Why:** removed agent names would otherwise reach `*) allow` from a cached session.

**How to apply:** a later card re-adding a retired name, or touching that case, must keep both names denied, bare and prefixed. Break-mode harness that worked: `git archive` is refused, so copy the worktree with `rsync -a --exclude node_modules --exclude .git` into the scratchpad; scope-hook-contract, editor-models-contract and challenge-gate-contract all run green there without git or node_modules, and four scope-hook copies run in parallel in about 150 s. `date` was allowed in this run. See [[gate-run-quirks]].
