---
id: CF-161
title: Remove CF citations and history from code comments
status: Next
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 08:56'
labels: []
dependencies: []
type: chore
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18, extending CF-158's present-tense rule to code comments: opencode/coder-fleet/lib/scope.ts, the hook scripts, the board source the fleet changed, and the tests carry CF-nn citations and backstory.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No code comment in claude/ or opencode/ cites a CF item, PR number or date, or narrates past behaviour; comments state what the code does and why
- [ ] #2 Test names that cite a CF item are renamed to describe the behaviour
- [ ] #3 The vendored board fork's upstream NOTICE.md and LICENSE are untouched
- [ ] #4 bash claude/evals/lib/check-all.sh and the OpenCode unit tests pass
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
