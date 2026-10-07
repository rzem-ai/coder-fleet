---
id: CF-155
title: Open the board in the browser when /board starts it
status: In Progress
assignee: []
created_date: '2026-10-07 00:02'
updated_date: '2026-10-07 00:05'
labels:
  - board
  - outcome/shipped
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
- [x] #1 After `/board` prints the URL, it opens that URL in the human's default browser: `open` on macOS, `xdg-open` on Linux, and on any other platform or when the opener is missing or fails, it says the browser could not be opened and leaves the printed URL as the way in
- [x] #2 It opens only a loopback URL (host 127.0.0.1, ::1 or localhost) and never any other address
- [x] #3 `/board stop` opens nothing
- [x] #4 bash claude/evals/lib/check-all.sh passes on the branch
- [x] #5 The version is bumped in plugin.json and .claude-plugin/marketplace.json
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-07 00:02
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-5.

The human asked for this in the session on 2026-10-07, which is the order. The lead builds it itself under lead.md's size floor, in its own worktree, landing through a PR.

Done: nothing yet.

Not done: /board still prints the URL and opens nothing.
---

created: 2026-10-07 00:05
---
Sub-issue 1 of 1: merged to main in PR #78, released as v0.39.1 (tag on ee70f92). Done still needs: nothing.

Done: after updating the plugin, `/board` prints the URL and opens it in your default browser (`open` on macOS, `xdg-open` on Linux), only for a loopback host; when it cannot, it says so in one line and the printed URL still works. `/board stop` opens nothing.

Evidence: criteria 1 to 3 are step 3 of claude/coder-fleet/commands/board.md on main, read by the lead. 4: CI's deterministic suite SUCCESS on ee70f92. 5: both plugin files at 0.39.1.

Definition of Done: 1 as criterion 4. 2: the human asked to ship it directly ('version bump it, commit it, tag it, push it'), so the review round the lead had started was stopped before its verdict; the change is a five-line edit to one command's prose, and CI ran the full suite independently. 3 not applicable: a command, not an agent body or skill frontmatter. 4 v0.39.1 tagged and pushed. 5 not applicable: no ported artefact. 6 not applicable: no spec.

Not done: the open was tried in this session by hand (the board came up in the browser), but the new step itself has not run until the plugin is updated.
---
<!-- COMMENTS:END -->
