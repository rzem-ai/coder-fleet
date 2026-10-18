---
id: CF-163
title: Make the board's archive-clears-before-move test pass reliably under load
status: To Do
assignee: []
created_date: '2026-10-18 08:06'
labels: []
dependencies: []
type: bug
ordinal: 298000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18. On the PR #96 branch, `archive-clears-before-move` in claude/coder-fleet/board/src/test/actions-for-human-core.test.ts failed once during check-all at load average 47 (commit count 4, expected 5), then passed (50 pass, 0 fail) when rerun with `bun test --timeout=60000` on the same commit at load 42. Two runs with different outcomes make it an intermittent failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of the missing commit under load is found and named on the card (for example, an auto-commit raced, debounced or dropped), with evidence
- [ ] #2 The test checks the outcome it is about without depending on how fast the machine is, and a real regression in the archive-before-move order still fails it
- [ ] #3 The test passes in 20 back-to-back runs with the machine loaded (for example, alongside a check-all run), and the command and results are recorded on the card
- [ ] #4 bash claude/evals/lib/check-all.sh passes, apart from CF-159 while that is open
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
