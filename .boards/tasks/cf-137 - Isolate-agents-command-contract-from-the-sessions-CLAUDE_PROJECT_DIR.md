---
id: CF-137
title: Isolate agents-command-contract from the session's CLAUDE_PROJECT_DIR
status: In Progress
assignee: []
created_date: '2026-10-05 12:17'
updated_date: '2026-10-05 12:50'
labels: []
dependencies: []
references:
  - claude/evals/lib/agents-command-contract.sh
  - claude/coder-fleet/hooks/enforce-disabled-agents.sh
  - CF-128
priority: High
type: bug
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lead on 2026-10-05 while closing CF-128. `claude/evals/lib/agents-command-contract.sh:127`, "the spawn hook denies the refuter the command disabled", fails whenever CLAUDE_PROJECT_DIR is set to a real project, which it always is inside a session hook: run with it set, the suite gives 65 passed, 1 failed. With it unset, 66 pass. The likely cause is that the spawn hook resolves the project from CLAUDE_PROJECT_DIR and reads the real repo (which has no .claude/coder-fleet.json) instead of the test's fixture project. It reproduces on fc5bd80 (before 2026-10-05's merges), so it has been there since CF-111.1/CF-113 (v0.30.0). Effect: this repo's strict TaskCompleted gate runs check-all from the hook, so every [board:<id>] close here is refused with `FAILED: agents-command`. CF-128 was moved to Blocked by it; CF-24.4 and CF-127 can't close either. Not yet ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 agents-command-contract.sh passes 66/66 both with CLAUDE_PROJECT_DIR unset and with it set to a real project with no .claude/coder-fleet.json, because every case clears or overrides the variable for its fixture
- [ ] #2 A case proves the suite cannot read the caller's project config, and it fails if the isolation is removed
- [ ] #3 Every other contract suite that runs fleet-config or a spawn hook is checked for the same leak, and any found is fixed or filed
- [ ] #4 check-all.sh is green when run as the TaskCompleted hook runs it
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-05 12:24
---
2026-10-05, the human, in the session: "Fix CF-137 now", ordered. Decision recorded for the builder: the fix goes in the tests (isolate them from the caller's environment); the spawn hook's use of CLAUDE_PROJECT_DIR is correct production behaviour and stays as it is. Version: v0.33.1 (patch, test-only).

Sub-issue 1 of 1: started. Done still needs: criteria 1-4. Done: nothing yet. Not done: every [board:] close in this repo is still refused under the strict gate, so CF-24.4, CF-127 and CF-128 can't reach Done.
---

author: @SubagentStop
created: 2026-10-05 12:50
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- PR #59: https://github.com/rzem-ai/coder-fleet/pull/59. Not merged; `.boards/` untouched and no status moved. Branch `cf-137-test-isolation` is cut from origin/main (4b7c7a0, which contains 81fda2f). The worktree started at 062fbdb, so I switched branches first.
- Cause confirmed before fixing. `CLAUDE_PROJECT_DIR=<worktree> bash claude/evals/lib/agents-command-contract.sh` gave 65 passed, 1 failed ("the spawn hook denies the refuter the command disabled"); unset gave 66/66. `hook_decision` inherits the variable, and `enforce-disabled-agents.sh` (lines 134-135) puts it ahead of the event's cwd. The hook is unchanged.
- Fix, commit 3689492, in `claude/evals/lib/agents-command-contract.sh`: one isolation point at the top, `unset CLAUDE_PROJECT_DIR CODER_FLEET_REPO`. `CODER_FLEET_REPO` is the write-scope hook's override of the same kind. The `GIT_*` variables are already unset by `_fleet_git`, and the state dir is already the fixture's, so nothing else in the resolution path reads the session.
- Version bump, commit ee7848e, subject `v0.33.1: ...`, in `claude/coder-fleet/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. check-all's versions check reports 0.33.1 for both.
- Criterion 1: the suite exits 0 with 67 passed, 0 failed with `CLAUDE_PROJECT_DIR` set to the worktree, set to the main checkout (no `.claude/coder-fleet.json`), and unset. 67 is the original 66 plus the new case. Proof is `both.sh` in the scratchpad.
- Criterion 2: the new case reruns the suite with `CLAUDE_PROJECT_DIR` at a git-initialised decoy project whose config disables `scout`. An `AGENTS_COMMAND_NESTED` marker stops the recursion. With the `unset` line replaced by `:` in a temp copy (deleted afterwards), it exited 1 in all three modes. With the variable at the worktree or main checkout it gave 65 passed, 2 failed; unset gave 66 passed, 1 failed, the new case alone.
- Criterion 3: each of these suites exited 0 under `CLAUDE_PROJECT_DIR` set to the worktree, set to the main checkout, and unset. Their pass counts were disabled-agents-contract 144, scope-hook-contract 592, board-hook-contract 204, task-tools-contract 20, worktree-base-contract 27, roster-contract 155, runner-gate 26 and handoff-extractor-parity 144, with 0 failed in each. handoff-parity exited 0 and prints no count line.
- Criterion 3, result: no leak found, so there was nothing to fix or file. The suites that use the variable already set or unset it per case.
- Criterion 4: `CLAUDE_PROJECT_DIR=<worktree> bash claude/evals/lib/check-all.sh` ran once, captured to a file I then read. It exited 0 with "Every deterministic check passes", no FAILED lines, and `agents-command: ok`. The run was on the tree containing both commits.
---
<!-- COMMENTS:END -->
