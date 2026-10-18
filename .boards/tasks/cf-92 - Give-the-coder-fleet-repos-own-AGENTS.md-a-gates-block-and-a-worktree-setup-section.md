---
id: CF-92
title: >-
  Give the coder-fleet repo's own AGENTS.md a gates block and a worktree setup
  section
status: In Progress
assignee: []
created_date: '2026-09-30 09:12'
updated_date: '2026-10-18 11:22'
labels: []
dependencies:
  - CF-52
  - CF-90
priority: Medium
type: docs
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-52 and CF-90, 2026-09-30. CF-52 adds a Worktree setup section to templates/AGENTS.md that coders follow before building; CF-90 adds a ```gates``` block that the reviewer may run. This repo's own AGENTS.md has neither, so coders here don't know that the board tests need `bun install --frozen-lockfile` in claude/coder-fleet/board, and reviewers here have no gates to run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md has a Worktree setup section saying how a fresh worktree gets its dependencies (bun install --frozen-lockfile in claude/coder-fleet/board for the board tests)
- [ ] #2 AGENTS.md has a gates block naming the deterministic suite and the contract suites a reviewer may run, and the CF-90 hook allows each from a linked worktree
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-18 11:19
---
2026-10-18: hit again on CF-161. The reviewer on PR #99 could not run check-all because the scope hook refuses it without a gates block in AGENTS.md, so the lead ran the gate instead. The same happened on CF-158 and CF-165 reviews.
---

created: 2026-10-18 11:22
---
2026-10-18: the human, via AskUserQuestion, "Yes, add to Next". Taken now, alongside CF-161 and CF-164.1, because it touches only AGENTS.md and lets the reviewers on those PRs run the suite.

Sub-issue 1 of 1: started. Done still needs: criteria 1-3. Done: nothing yet. Not done: reviewers here still cannot run the suite.
---
<!-- COMMENTS:END -->
