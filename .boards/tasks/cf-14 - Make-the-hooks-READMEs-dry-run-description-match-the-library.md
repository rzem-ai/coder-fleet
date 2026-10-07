---
id: CF-14
title: Make the hooks README's dry-run description match the library
status: To Do
assignee: []
created_date: '2026-09-27 02:00'
updated_date: '2026-09-30 14:02'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/README.md
  - claude/coder-fleet/hooks/lib/board.sh
priority: Low
type: bug
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-8 fix-round coder. claude/coder-fleet/hooks/README.md:97 says BOARD_DRY_RUN=1 prints the full comment to stderr and still writes an archive when a comment is cut, but in lib/board.sh board_write and board_comment log one line in a dry run, and the cut-and-archive step (board_cap_comment) runs only on a real send. Either the README or the library is wrong. Predates CF-8.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 README and lib/board.sh agree on what a dry run prints and whether it archives
- [ ] #2 If the library changes, a contract case covers the dry-run output
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
author: @lead
created: 2026-09-27 02:28
---
Folded into CF-19 at the human's request, 2026-09-27, with CF-15, CF-16 and CF-18. Work happens there; this item closes with outcome/superseded when CF-19 lands.
---
<!-- COMMENTS:END -->
