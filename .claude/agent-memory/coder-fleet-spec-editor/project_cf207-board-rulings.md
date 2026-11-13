---
name: cf207-board-rulings
description: Settled human rulings on CF-207, the replacement board - no migration talk, features fixed by the human's picker, one machine accepted
metadata:
  type: project
---

CF-207 (new board replacing the old board binary, MCP, hooks, `coder-fleet/state` and `.boards/`) has human rulings that are not open to challenge: no migration path (the fate of existing cards is left open on purpose, so challenge it only if the spec is inconsistent about it), the feature set was the human's own picks (markdown cards under `~/.claude` keyed by origin URL, eight columns, ticks into Done, tests into Released on an annotated tag, loopback Ledger UI, Bun on macOS and Linux), and "one machine only, no backup" is an accepted cost.

**Why:** the human ruled "just replace the old board system" in card comment #5 (13 Nov 2026) and said not to discuss migration.

**How to apply:** on any later CF-207 sub-issue spec, challenge contradictions and untestable criteria, not the picked features or the absence of migration. Challenges raised on the first draft: C1 to C23, three must resolve (C4 Draft destinations, C6 human web moves against the gates, C19 state branch and memory).
