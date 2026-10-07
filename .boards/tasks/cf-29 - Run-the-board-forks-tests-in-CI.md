---
id: CF-29
title: Run the board fork's tests in CI
status: To Do
assignee: []
created_date: '2026-09-27 03:18'
updated_date: '2026-10-07 09:25'
labels: []
dependencies: []
references:
  - .github/workflows/checks.yml
  - claude/evals/lib/check-all.sh
  - claude/coder-fleet/board
priority: Medium
type: enhancement
ordinal: 288000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by spec-writer while drafting CF-24 and CF-25. `claude/evals/lib/check-all.sh` skips the board package's own tests when bun is absent, and `.github/workflows/checks.yml` installs no bun, so every change to the carried board fork (CF-25's field, CF-26, CF-27) is proven only on the machine that ran it, and the live SubagentStart/Stop contract cases never run in CI either (see CF-8's PR notes). Add bun to the workflow, pinned, and make check-all fail rather than skip when CI=true and bun is missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 checks.yml installs a pinned bun and the board package tests run in CI
- [ ] #2 The live board-hook contract cases run in CI
- [ ] #3 check-all.sh fails, not skips, when CI is set and bun is absent
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
created: 2026-09-30 09:13
---
2026-09-30: CF-24.2 adds a board-backfill contract lane that also skips in CI without bun, alongside the board lane. Both run only locally until this lands.
---

created: 2026-10-07 09:25
---
Ordered by the human, 2026-10-07 (chosen in the session from the lead's list). Sub-issue 1 of 1: started. Done still needs: criteria 1 to 3.

Context the builder needs: since this card was filed, the board section and the board-backfill, board-git-check and live board-hook cases all depend on bun, and CF-21 showed a Linux-only failure that only CI could catch, so bun in CI now covers far more than the fork's own tests. CF-56.1 is being built in parallel and also edits check-all.sh (the rc-file handling around line 135); this card's change is the bun-missing skip around lines 174-187.

Done: nothing yet; a scripter is being spawned.

Not done: CI still skips every bun-dependent check.
---
<!-- COMMENTS:END -->
