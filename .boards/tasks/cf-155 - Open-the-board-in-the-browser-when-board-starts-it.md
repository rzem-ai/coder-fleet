---
id: CF-155
title: Open the board in the browser when /board starts it
status: To Do
assignee: []
created_date: '2026-10-07 00:02'
labels:
  - board
dependencies: []
priority: Medium
type: enhancement
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-07: "when selecting `/coder-fleet:board`, can it attempt to open a browser at the address?" Today step 2 of claude/coder-fleet/commands/board.md says "Do not open a browser". The lead builds this itself under the size floor (no endpoint, no schema, no credential path): a change to the command's prose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After `/board` prints the URL, it opens that URL in the human's default browser: `open` on macOS, `xdg-open` on Linux, and on any other platform or when the opener is missing or fails, it says the browser could not be opened and leaves the printed URL as the way in
- [ ] #2 It opens only a loopback URL (host 127.0.0.1, ::1 or localhost) and never any other address
- [ ] #3 `/board stop` opens nothing
- [ ] #4 bash claude/evals/lib/check-all.sh passes on the branch
- [ ] #5 The version is bumped in plugin.json and .claude-plugin/marketplace.json
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
