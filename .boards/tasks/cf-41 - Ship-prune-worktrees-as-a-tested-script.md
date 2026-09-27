---
id: CF-41
title: Ship prune-worktrees as a tested script
status: In Progress
assignee: []
created_date: '2026-09-27 06:56'
updated_date: '2026-09-27 07:41'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/13'
  - claude/coder-fleet/commands/prune-worktrees.md
  - docs/plans/CF-41.md
priority: Medium
type: bug
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#13 (read as data). commands/prune-worktrees.md describes the scratch-directory sweep in prose, so the lead hand-rolls it each run. On 2026-09-27 in this repo a hand-rolled `grep -qx "$n"` read a scratch name beginning with `-` as options, the live check failed, and two live worktrees' scratch directories were deleted. Ship a prune script beside the hooks, with `--` before every pattern, a dry-run flag and a contract test, and make the command call it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claude/coder-fleet/scripts/prune-worktrees.sh performs every step of the command, never uses --force or -D, and supports --dry-run
- [ ] #2 prune-worktrees-contract.sh covers the plan's cases, runs under bash 3.2 and bash 5, never touches the real scratch root, and failed first on the P, S, D and T01-T02/T04 cases
- [ ] #3 The sweep removes only unmatched <enc-root>--claude-worktrees- directories and keeps live, live-subdirectory, sibling-project and other-project entries
- [ ] #4 prune-worktrees.md calls the script by ${CLAUDE_PLUGIN_ROOT} and has no hand-rolled steps left
- [ ] #5 check-all runs the contract and syntax-checks scripts/, and passes locally and in CI
- [ ] #6 The plugin patch is bumped in the last commit, with the number picked at merge
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-41.md approved by the human 2026-09-27, every open question on the recommended answer (whole command scripted, act by default with --dry-run, scripts/ not bin/, skip the sweep on unverified encodings). Criteria replaced by the plan's Done when. Phase 1 of 3 starting: one coder.
---

author: @SubagentStop
created: 2026-09-27 07:35
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-41-prune-script` cut from a freshly fetched `origin/main` (32e995e), upstream unset. Nothing pushed, worktree clean, no version bump.
- Commit `fa4e584` "Add the approved CF-41 plan": `docs/plans/CF-41.md`, and `cmp` against the main checkout's copy shows the two are identical.
- Commit `15a5719` "Script prune-worktrees and pin it with a contract test": `claude/coder-fleet/scripts/prune-worktrees.sh` and `claude/evals/lib/prune-worktrees-contract.sh`, both executable.
- Commit `78acc81` "Point prune-worktrees at the script and wire its contract into check-all": `claude/coder-fleet/commands/prune-worktrees.md` keeps lines 1-13 and the closing paragraph, and its procedure is replaced by the script call and the mapping to four lists. `claude/evals/lib/check-all.sh` gets a header line, `$PLUGIN_ROOT/scripts` in the syntax `find` and a `run prune-worktrees` line. The `docs/fleet-design.md` tree gets a `scripts/` line.
- Red run, with the script absent and the command still prose: `bash <wt>/claude/evals/lib/prune-worktrees-contract.sh -v` gave exit 1, 0 passed, 84 failed. `/bin/bash` gave the same. Every case was red, T03 included, and none was green.
- Why each red case failed: T03 "script exists" and "bash -n" fail because the file is missing. T01 and T02 require the script to exist before they scan it. T04 fails because the command has no `"${CLAUDE_PLUGIN_ROOT}/scripts/prune-worktrees.sh"` and still says `rm -rf`. D01, P01-P09 and S01-S10 fail because every check after a run needs that run to exit 0, and the missing script exits 127, so "kept" and "unchanged" checks cannot pass by accident. The usage cases fail because 127 is not 2.
- After Phase 2: 82 passed, 2 failed under both interpreters. Only T04 was red, and it went green in `78acc81`.
- Green runs, once each: `bash ... -v` gave exit 0, 84 passed, 0 failed (bash 5.3.9). `/bin/bash ...` gave exit 0, 84 passed, 0 failed (3.2.57).
- The plan's mutation, `is_live` replaced by `printf ... | grep -qx "$1"`, was killed: exit 1, 76 passed, 8 failed. S02 went red on both its checks and S03 on both. T02 and "the refused worktree's entry is kept" also went red, and T04 was already red.
- Follow-up mutation `grep -qx -- "$1"`, which leaves exact equality only, was killed by S03 alone (80 passed, 4 failed, two of them the old T04). Both mutations were reverted with `git restore`, and status is clean.
- check-all was run once from the worktree root, with output captured in `<scratchpad>/coder-CF-41/checkall/check-all.log`. Exit 0. The grep shows every section ok, `prune-worktrees: ok` at 84 passed, and "Every deterministic check passes."
- Dry run in the main checkout, with `--dry-run` only and `CODER_FLEET_SCRATCH_ROOT` unset: exit 0, 12 `kept` lines (1 not-agent, 1 dirty, 10 unmerged), no sweep line. That matches `git worktree list`, and both real `coder-fleet--claude-worktrees-*` entries under `/private/tmp/claude-501` belong to live worktrees. No `sweep-skipped no-scratch-root` was printed, so the default scratch root was found.
---

author: @lead
created: 2026-09-27 07:36
---
Phases 1-3 built on cf-41-prune-script at 78acc81 (not pushed, no version bump). Contract 0/84 red with the script absent, 84/84 green under bash 5.3.9 and /bin/bash 3.2.57; the grep -qx mutation (today's incident) killed by S02 and S03; check-all green; dry run in the main checkout kept all 12 worktrees and swept nothing. Deviation accepted by the lead: P06 uses a modules dir in the worktree's admin dir, because a read-only parent makes git empty the worktree before failing - the plan's assertions all stand and the root skip goes away. Reviewer and refuter running in parallel (data-write tier: it deletes directories). Filed: CF-47 - the worktree guard over-refused, and the coder ran its checks through scratchpad wrapper scripts the guard never inspected.
---

author: @SubagentStop
created: 2026-09-27 07:39
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: contract in the scratch copy of 78acc81 gave 84 passed, 0 failed, exit 0. Budget: 8 mutants plus 1 probe, 20 minutes; about 4 minutes used.
- survived: deleted line 207 `unverified "$pr" && { emit sweep-skipped encoding-unverified; exit 0; }` - no test gives a live worktree a path with characters outside `[A-Za-z0-9/._-]`. S09 only covers the main checkout (line 196). The sweep can then treat a live worktree's scratch as stale and delete it (84 passed, 0 failed, exit 0).
- survived: line 219 `case "$1" in "$e"-*)` changed to `"$e"*)` - no test has one worktree name that is a prefix of another without a `-` after it, so a removed `wt-ab`'s scratch is kept while `wt-a` lives. This keeps too much and never deletes too much (84 passed, 0 failed, exit 0).
- killed: `AGENT_PREFIX` without the trailing slash - P04 (2 failed, exit 1).
- killed: `--untracked-files=normal` changed to `--untracked-files=no` - P02 and S08 (2 failed, exit 1). Dropping the whole clean check keeps even fewer worktrees than this mutant, so P02 fails the same way; I didn't run it separately.
- killed: `merge-base --is-ancestor "$1" "$ref"` changed to `"$1" "$1"` (always true) - P03 and P08 (4 failed, exit 1).
- killed: `SCRATCH_PREFIX="$(enc "$MAIN_REAL")"` (anchor dropped) - S05 (2 failed, exit 1).
- killed: symlink skip `[ -L "$entry" ] && continue` deleted - S07 (2 failed, exit 1).
- killed: `then DRY=1` changed to `then DRY=0` (dry run removes for real) - D01 (14 failed, exit 1).
- Convergence: this is the first round, so there is nothing to compare against. All findings are new.
- Scratch tree and outputs are under /private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/refuter-cf41-r1/ (`base/`, `M1`-`M8/`, `M*.out`, `baseline.txt`).
---

author: @SubagentStop
created: 2026-09-27 07:41
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. I reviewed `git diff origin/main...HEAD` (fa4e584..78acc81, 6 files) against `docs/plans/CF-41.md` and its Done when. I read `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-afe92a226d96e6108/claude/coder-fleet/scripts/prune-worktrees.sh`, `.../claude/evals/lib/prune-worktrees-contract.sh`, `.../claude/coder-fleet/commands/prune-worktrees.md`, the check-all wiring and the coder's check-all log.
- must fix: claude/coder-fleet/scripts/prune-worktrees.sh:150 - it unlocks a worktree the harness has locked for a still-running agent (reason `claude agent <id> (pid N ...)`; only the running agent's worktree carries a lock in the real repository) and removes it when clean and merged, which is true of every freshly cut coder worktree. The live agent loses its worktree and its scratch. Keep locked worktrees as `kept <path> locked`, or unlock only when the named pid is dead, and add a contract case.
- Should fix: pin the `--untracked-files=normal` flag at `prune-worktrees.sh:117` with a `status.showUntrackedFiles no` case. Without it, git's own clean check would delete untracked files.
- Should fix: correct the prose at `prune-worktrees.md:31` (a `re-lock:` refusal means git already deleted part or all of the worktree) and at `:26` (stop on any non-zero exit, not only 2).
- Judged the declared deviations acceptable: the P06 `modules` fixture, running with `"$BASH"`, `sweep-skipped no-scratch-root`, the dry-run sweep prediction (behaviour fine, not pinned by a test) and taking the main checkout from the first porcelain entry.
- Run article: returned above this handoff for the lead to save as `docs/runs/2026-09-27-reviewer-CF-41.md`.
---
<!-- COMMENTS:END -->
