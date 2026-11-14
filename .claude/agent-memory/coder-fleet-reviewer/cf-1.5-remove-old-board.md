---
name: cf-1.5-remove-old-board
description: CF-1.5 (CF-207 group G part 5) - old board removed; spec/ui/reviewer scope moved to <board>/specs and <board>/runs; round 2 README fixed and evals renamed to specs/ and cards/
metadata:
  type: project
---

CF-1.5 round 1 (2026-11-15, head 3e96f9ce, PR #221): request changes on one criterion-53 miss. hooks/README.md "Per-agent tool scoping" (lines 108-153), line 202 (lib/board.sh) and line 267 (.boards/.focus) still described docs/specs, docs/runs and the old board.

Round 2 (head ab2f04d8, range 3e96f9ce..ab2f04d8): README now names <board>/specs, <board>/runs and the focus in ~/.local/state/coder-fleet-boards/, matching write-scope.ts and scope.ts; no docs/specs, docs/runs, lib/board.sh or .boards left in it. Paid evals renamed: fixtures' docs/specs -> specs/, steward cards under workspace cards/ (CF-9.md); spec-editor checks.sh takes the draft from the prompt's `#!draft:` line, so the prompts carry the path. Contract changes were path-only.

Settled sound (round 1): write-scope.ts SPECS_ROLES anchor to resolveBoard(cwd) physically, deny with no board, deny on throw; protectedRoots adds boardsRoot and stateRoot for --outside; reviewerProgressOk wants <board>/runs, resolved from CLAUDE_PROJECT_DIR. All 16 MCP names served by mcp.ts MCP_TOOLS.

Open, not raised: the paid evals' workspace specs/ is a stand-in; a live spec-writer run in an eval workspace with no board would be denied by the real hook. Never run (paid), so unverified.

**Why:** a later round or merge review should not re-raise the README or the eval paths.

**How to apply:** treat the scope confinement, README and eval renames as settled; only the live-eval-workspace question stays open. See [[cf-1.4-register-hooks]] and [[cf-207.10-scope-guard]].
