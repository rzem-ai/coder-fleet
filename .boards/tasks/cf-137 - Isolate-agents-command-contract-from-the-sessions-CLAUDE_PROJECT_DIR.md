---
id: CF-137
title: Isolate agents-command-contract from the session's CLAUDE_PROJECT_DIR
status: To Do
assignee: []
created_date: '2026-10-05 12:17'
updated_date: '2026-10-06 03:52'
labels: []
dependencies: []
references:
  - claude/evals/lib/agents-command-contract.sh
  - claude/coder-fleet/hooks/enforce-disabled-agents.sh
  - CF-128
priority: High
type: bug
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lead on 2026-10-05 while closing CF-128. `claude/evals/lib/agents-command-contract.sh:127`, "the spawn hook denies the refuter the command disabled", fails whenever CLAUDE_PROJECT_DIR is set to a real project, which it always is inside a session hook: run with it set, the suite gives 65 passed, 1 failed. With it unset, 66 pass. The likely cause is that the spawn hook resolves the project from CLAUDE_PROJECT_DIR and reads the real repo (which has no .claude/coder-fleet.json) instead of the test's fixture project. It reproduces on fc5bd80 (before 2026-10-05's merges), so it has been there since CF-111.1/CF-113 (v0.30.0). Effect: this repo's strict TaskCompleted gate runs check-all from the hook, so every [board:<id>] close here is refused with `FAILED: agents-command`. CF-128 was moved to Blocked by it; CF-24.4 and CF-127 can't close either. Not yet ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 agents-command-contract.sh passes 66/66 both with CLAUDE_PROJECT_DIR unset and with it set to a real project with no .claude/coder-fleet.json, because every case clears or overrides the variable for its fixture
- [x] #2 A case proves the suite cannot read the caller's project config, and it fails if the isolation is removed
- [x] #3 Every other contract suite that runs fleet-config or a spawn hook is checked for the same leak, and any found is fixed or filed
- [x] #4 check-all.sh is green when run as the TaskCompleted hook runs it
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
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

created: 2026-10-05 12:50
---
Sub-issue 1 of 1: built, in review as PR #59 (cf-137-test-isolation, v0.33.1). Done still needs: criteria 1-4 proven on main, a review plus refuter (High), DoD 4 (tag).

Done, on the scripter's word: cause confirmed. enforce-disabled-agents.sh:134-135 puts CLAUDE_PROJECT_DIR ahead of the event's cwd, and hook_decision inherited it. The fix is one isolation point, `unset CLAUDE_PROJECT_DIR CODER_FLEET_REPO`, at the top of agents-command-contract.sh (3689492); the hook is unchanged. A new case reruns the suite with CLAUDE_PROJECT_DIR at a decoy project that disables scout; it was seen failing with the unset removed. The suite gives 67/67 with the variable unset, at the worktree and at the main checkout. Eight other suites gave identical results each way, so no leak was found elsewhere. `CLAUDE_PROJECT_DIR=<worktree> check-all.sh` was exit 0. Version bumped to 0.33.1 (ee7848e).

Not done: not reviewed or merged, so card closes in this repo are still refused. Review round 1 with the refuter is running (wf_a9048830-5ab).
---

author: @SubagentStop
created: 2026-10-05 13:13
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: full gate in scratch exited 1 after 568s, red only on task-tools because the scratch copy has no `.git` (same 2 failures with `CLAUDE_PROJECT_DIR` unset). Narrow suite `agents-command-contract.sh` exited 0 in 33s, 67/67.
- Budget: at most 8 mutants and 20 minutes. Used 4 mutants and about 12 minutes.
- M1 (unset line changed to `:`): killed, exit 1 with the variable unset and with it set to the real repo.
- M2 (`CODER_FLEET_REPO` dropped from the unset, decoy injected): exit 0, equivalent mutant. The suite runs no hook that reads `CODER_FLEET_REPO` (only enforce-agent-scope.sh:1174 and check-write-scope.py:120 do).
- M3 (M1 plus decoy config changed to `{}`): killed, exit 1.
- M4 (marketplace version set back to 0.33.0): killed by the versions check, exit 1.
- Acceptance criterion 3 probe with `CLAUDE_PROJECT_DIR` at a decoy that disables scout and refuter: disabled-agents-contract, worktree-base-contract and runner-gate exited 0. task-tools gave no answer (same harness failures).
- low: claude/evals/lib/agents-command-contract.sh:337 - the decoy case says it catches a leak through "a project that disables scout", but scout is not what catches it. With the decoy config set to `{}` it still fails, on "the spawn hook denies the refuter the command disabled". Any directory without the refuter disabled would do. The case name and comment describe a mechanism the test does not depend on.
- Convergence: this is round 1, so there is no earlier round to compare against.
---

created: 2026-10-05 13:29
---
Sub-issue 1 of 1: merged to main at 813a673 (PR #59, v0.33.1; merged by the human). Done still needs: DoD 4 (tag v0.33.1).

Review round 1 (wf_a9048830-5ab): approve with follow-ups, 0 blocking. Refuter, at most 8 mutants: M1 (the unset removed) killed, with the variable unset and set; M3 (M1 plus an empty decoy config) killed; M4 (the version reverted) killed; M2 (CODER_FLEET_REPO dropped from the unset) is equivalent, since this suite runs no hook that reads it. The review's mechanical lanes ran on main at 3056181, which doesn't contain the fix, and the refuter's scratch copy had no .git, so the lead ran the gate itself: `CLAUDE_PROJECT_DIR=<worktree> bash claude/evals/lib/check-all.sh` on ee7848e gave exit 0, agents-command ok, task-tools ok, versions 0.33.1.

Ticks, by the lead, on evidence now on main. #1 agents-command 67/67 with CLAUDE_PROJECT_DIR set, in the lead's run above. #2 the nested decoy case, refuter M1 and M3 killed. #3 the scripter's eight-suite comparison, and the refuter's probe (disabled-agents, worktree-base, runner-gate exit 0 at a decoy). #4 the lead's run above. DoD #1 the same; #2 reviewer approve plus the refuter (High); #3 not applicable: no agent body or skill frontmatter changed; #5 not applicable: a test-only change, with no port counterpart; #6 not applicable: no spec.

Dropped lows (no fix round ran): the decoy case passes without testing anything on a machine without git (no HAVE_GIT skip, line 338); the comment's CODER_FLEET_REPO reason names a hook the suite never runs (line 41); the case name credits scout, but the refuter deny is what catches the leak (line 337). Done: card closes in this repo are no longer refused by agents-command. Not done: v0.33.1 is not tagged.
---

author: lead
created: 2026-10-06 03:52
---
Triage 2026-10-06. Merged in PR #59 (813a673), release commit ee7848e 'v0.33.1: isolate agents-command-contract ...'. Criteria 1-4 are ticked. DoD #4 is open because no v0.33.1 tag exists, locally or on origin (checked with git cat-file and git ls-remote --tags). The lead is asking the human about creating and pushing it before closing this card.
---
<!-- COMMENTS:END -->
