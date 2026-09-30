---
id: CF-37
title: Assert the invalid-role case refuses before any write
status: To Do
assignee: []
created_date: '2026-09-27 05:15'
updated_date: '2026-09-30 14:02'
labels: []
dependencies:
  - CF-12.2
references:
  - claude/evals/lib/agent-pairs-contract.sh
  - claude/scripts/gen-agent-pairs.sh
priority: Low
type: chore
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-12.2 refuter round 3 (2026-09-27). In `claude/evals/lib/agent-pairs-contract.sh`, `refuses-role-invalid-chars-exit` stays green with the role character check neutralised, because a later write of `bad.md` fails and still exits 1; only the message assertion guards the check. Make the case also assert that nothing was written or attempted for the bad role (for example, that no write-failure message appears), so the exit assertion fails for the right reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With the role character check in gen-agent-pairs.sh replaced by true, at least two refuses-role-invalid-chars assertions fail, seen failing first
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
