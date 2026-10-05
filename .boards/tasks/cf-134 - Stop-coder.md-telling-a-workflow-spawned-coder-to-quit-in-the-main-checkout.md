---
id: CF-134
title: Stop coder.md telling a workflow-spawned coder to quit in the main checkout
status: In Progress
assignee: []
created_date: '2026-10-05 10:23'
updated_date: '2026-10-05 13:06'
labels: []
dependencies: []
references:
  - CF-127
  - claude/coder-fleet/agents/coder.md
priority: Medium
type: bug
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the reviewer on CF-127 (PR #58). coder.md:19 says that if `git rev-parse --git-common-dir` shows the main checkout, the coder stops and says so. Since v0.32.0 every review-round fix-lane coder starts with the main checkout as its cwd and is handed a worktree the workflow cut, so a coder that follows its body before its prompt may stop with a blocker. `--git-common-dir` also names the main .git from a linked worktree, so the check can't tell the two apart. This may break the CF-52 #3 live re-run. It is an agent-body change, so it needs the migration checklist. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 coder.md's location check tells a linked worktree from the main checkout correctly (e.g. --git-dir against --git-common-dir), and does not stop a coder whose prompt hands it a workflow-cut worktree to work in through git -C and absolute paths
- [ ] #2 The migration-checklist findings are in the PR
- [ ] #3 check-all.sh is green
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
