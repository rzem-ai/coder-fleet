---
name: hook-ports-cf-1-3
description: Since CF-1.3 the scope, clock, disabled-agents, fast-forward and push-policy hooks are TS under boards/src/fleet; the five contract checks that pin the old runtime, and traps met porting them
metadata:
  type: project
---

Since CF-1.3 (2026-11-15), enforce-agent-scope.sh, agent-clock.sh, enforce-disabled-agents.sh, main-fast-forward.sh, lib/push-policy.sh and .py, and lib/check-write-scope.py are shims onto `boards fleet scope | clock | disabled-agents | fast-forward | push-policy | check-write-scope`. The sources are scope.ts plus scope-words.ts (the bash readers, ported literally), write-scope.ts, push-policy.ts, clock.ts, disabled-agents.ts, fast-forward.ts and hook.ts. A fail-closed tool prints `allow` or JSON, and its shim refuses on anything else.

Five checks pinned the old runtime. The human ruled that fail-closed wins over "contracts unchanged", so they were updated in the fix round: the no-python cases now expect a deny naming the binary, clock-no-jq-allows expects fail-open with stderr naming the binary, and roster-contract reads MEMORY_ONLY_TOOLS from scope.ts with sed. Every hook shim sources boards.sh and calls boards_run, with a 127 stub if sourcing fails; scope now takes 32-62 ms per call.

Traps met:
- Python's os.path.realpath follows dangling symlinks; the settings guard needs pyRealpath (push-policy.ts). check-write-scope's resolve walks up first, as its Python did.
- Writing to the main checkout's docs/runs from a worktree is refused; the run article goes in the worktree's ignored docs/runs/.
- `gh pr create` was refused by the auto-mode classifier for a coder, even when the lead asked for it; hand the PR body to the lead.
- Scope latency went from 540-870 ms per call to 56-78 ms; check-all came in at 127 s.

**Why:** CF-1.4 rewires hooks.json onto these, and CF-1.5 removes the old board and rewrites the docs.

**How to apply:** before changing a scope rule, edit scope.ts and keep the scope-words.ts readers literal, since the contracts pin their quirks. Related: [[fleet-tools-shims]], [[scope-hook-test-traps]], [[push-policy-hook-facts]].
