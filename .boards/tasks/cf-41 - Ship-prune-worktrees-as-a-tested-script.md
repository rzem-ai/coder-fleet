---
id: CF-41
title: Ship prune-worktrees as a tested script
status: In Progress
assignee: []
created_date: '2026-09-27 06:56'
updated_date: '2026-09-27 07:15'
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
<!-- COMMENTS:END -->
