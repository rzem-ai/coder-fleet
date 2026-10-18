---
id: CF-159
title: Make the board-binary contract's platform scrape work with BSD sed
status: In Progress
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 08:19'
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
- [ ] #1 The check passes with macOS /usr/bin/sed and with GNU sed, and still fails when the workflow and the hook disagree on platforms
- [ ] #2 bash claude/evals/lib/check-all.sh passes on the human's Mac with no GNU sed installed
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
