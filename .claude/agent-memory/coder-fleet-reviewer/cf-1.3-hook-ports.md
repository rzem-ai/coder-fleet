---
name: cf-1.3-hook-ports
description: CF-1.3 (CF-207 group G part 3) - scope, push-policy, write-scope, disabled-agents, clock, fast-forward hooks ported to `boards fleet`; shim fail-closed shape and the in-process fail-open that stays
metadata:
  type: project
---

CF-1.3 round 1 (2026-11-15, head 49133ac0): the rule hook shims (enforce-agent-scope.sh, enforce-disabled-agents.sh, lib/push-policy.sh) source boards.sh and accept only exit 0 plus `allow` or output starting `{`; anything else prints a deny. push-policy.py and check-write-scope.py shims call `/bin/bash boards.sh fleet ...` and accept only `ok`/`deny\t...` and `allowed`. Clock and fast-forward shims fail open. The scope hook runs push policy, write scope and reviewer modes in process (scope.ts), not through the shims.

Settled as parity, not a finding: scope.ts decide() and disabled-agents.ts catch any unexpected exception and print `allow`, exactly as the old bash ERR traps did ("It fails open. A bug here must not stop the fleet working."). Criterion 2 is about the binary failing to run or answering something other than allow, so this holds the letter. hook.ts's comment "a crash is never read as an allow" is true only of process crashes. Raised as a follow-up decision: whether in-process exceptions should now deny.

The 5 s push-policy budget (BUDGET, deadline, spawnSync timeout) is ported; the hook timeout in hooks.json is 10 s. The five decided contract edits are the only claude/evals/ changes: three no-binary scope cases, clock-no-jq-allows, roster-contract reading MEMORY_ONLY_TOOLS from scope.ts with a sed over `role: [...]` rows.

**Why:** the next CF-1 round (CF-1.4 registration and fetch) will rewire hooks.json; the shim contract above is what it must keep.

**How to apply:** if a later round changes decide()'s catch to deny, check the old fail-open contract cases (invalid JSON input allowed) still pass or were updated as a decided change. Progress log: the `date` line must be its own call; `mkdir -p dir; date ...` in one call is refused. See [[cf-1.2-fleet-tools-port]].
