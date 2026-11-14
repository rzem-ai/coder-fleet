---
name: cf-1.5-remove-old-board
description: CF-1.5 (CF-207 group G part 5) round 1 - old board removed; spec/ui/reviewer scope moved to <board>/specs and <board>/runs; hooks/README.md per-agent section left stale (criterion 53)
metadata:
  type: project
---

CF-1.5 round 1 (2026-11-15, head 3e96f9ce, PR #221): request changes on one criterion-53 miss. hooks/README.md "Per-agent tool scoping" (lines 108-153), line 202 (lib/board.sh) and line 267 (.boards/.focus) still describe docs/specs, docs/runs and the old board.

Settled sound: write-scope.ts SPECS_ROLES anchor to resolveBoard(cwd) physically, deny with no board, deny on throw (two boards); protectedRoots adds boardsRoot and stateRoot for the --outside rule; reviewerProgressOk now wants <board>/runs, resolved from CLAUDE_PROJECT_DIR. Contract pins both sides. All 16 granted mcp__plugin_coder-fleet_boards__* names are served by mcp.ts MCP_TOOLS. No executable code calls a deleted file (claude/scripts/spike/cf-12.1/setup.sh does, but nothing runs it).

Not a regression: break-mode reviewer Bash was open before (could write .boards/ then); its text-match protected list still names only the old state dir and transcripts, not ~/.config/boards or the boards state root. Routed as a follow-up.

Deferred by the coder to later cards: paid evals (spec-writer checks.sh, spec-editor prompts) still grade docs/specs/ writes, which the hook now denies.

**Why:** a round 2 should check the README fix and not re-raise the settled confinement.

**How to apply:** on round 2 grep hooks/README.md for docs/specs, docs/runs, lib/board.sh and .boards; leave the evals and break-Bash follow-ups alone. See [[cf-1.4-register-hooks]] and [[cf-207.10-scope-guard]].
