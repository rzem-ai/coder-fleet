---
id: CF-47
title: Stop the worktree guard pushing coders into wrapper scripts
status: To Do
assignee: []
created_date: '2026-09-27 07:35'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/enforce-agent-scope.sh
  - claude/evals/lib/scope-hook-contract.sh
  - docs/limits.md
priority: Medium
type: bug
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-41 coder's handoff, 2026-09-27. Two findings about claude/coder-fleet/hooks/enforce-agent-scope.sh's worktree guard:

1. It over-refuses. It refused `git -C <main checkout> worktree list`, which is read-only, and refused commands that name bash, including running the approved contract test and check-all by absolute path.
2. The coder then ran every contract, check-all and dry run through wrapper scripts it wrote in the scratchpad (chmod +x, run by path with no arguments). The guard never saw what those wrappers executed, so the refusal did not constrain anything; it only hid the command. The coder proposed this as a memory for other agents; the lead did not record it, because it teaches agents to sidestep a safety hook.

Needs: the guard allows read-only `git worktree list` and running an existing script under the worktree or the plugin by absolute path; and either the guard inspects what an executable written in the scratchpad runs, or the gap is recorded in docs/limits.md with its reason. A contract case for each, failing first.
<!-- SECTION:DESCRIPTION:END -->
