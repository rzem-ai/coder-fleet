---
id: CF-159
title: Make the board-binary contract's platform scrape work with BSD sed
status: In Progress
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 08:42'
labels: []
dependencies: []
type: bug
ordinal: 294000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18. board-binary-contract.sh case "the workflow builds exactly the platforms the hook fetches" uses GNU sed `\|` alternation, which returns nothing with macOS /usr/bin/sed, so check-all.sh fails locally on a Mac while CI (Linux) passes (seen on PR #95).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The check passes with macOS /usr/bin/sed and with GNU sed, and still fails when the workflow and the hook disagree on platforms
- [x] #2 bash claude/evals/lib/check-all.sh passes on the human's Mac with no GNU sed installed
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
created: 2026-10-18 08:30
---
Sub-issue 1 of 1: ready to merge in PR #97 (v0.41.3). Done still needs: the human to merge, then the tag.

Evidence:
- Reviewer approved.
- CI 'deterministic' passed in 4m37s.
- The scripter's check-all on this Mac with BSD sed only: exit 0, all 38 sections ok (board 319 pass).
- The case fails on a workflow platform mutant: 32 passed, 1 failed.
- One low was carried to CF-165, which bumps the README version line along with v0.41.4.

Done: check-all runs green on the human's Mac.
Not done: not merged yet.
---

created: 2026-10-18 08:42
---
Sub-issue 1 of 1: merged to main at 8262bbb (PR #97), release commit 3014bfc tagged v0.41.3. Done still needs: nothing on the criteria.

Evidence:
- #1: the case passes with /usr/bin/sed; it fails on a workflow platform mutant (32 passed, 1 failed); CI on Linux (GNU sed) passed.
- #2: check-all on the human's Mac with no GNU sed exited 0, all 38 sections ok, in the scripter's run on 3014bfc.

Done: the full suite runs green on the human's Mac.
---
<!-- COMMENTS:END -->
