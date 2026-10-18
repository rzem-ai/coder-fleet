---
id: CF-160
title: >-
  Rewrite the hooks README and the OpenCode divergence register as present-tense
  reference
status: Next
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 13:29'
labels: []
dependencies: []
type: docs
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18, following CF-158's rule that live docs carry no history. claude/coder-fleet/hooks/README.md items 16 to 27 and opencode/docs/divergence-register.md still read partly as a change log.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claude/coder-fleet/hooks/README.md states what each hook does now, with no dated anecdotes, CF citations or 'was / used to' history
- [ ] #2 opencode/docs/divergence-register.md rows state the current divergence and its reason only
- [ ] #3 A reason that materially matters moves to a doc under docs/decisions/ and is linked
- [ ] #4 bash claude/evals/lib/check-all.sh passes
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
created: 2026-10-18 13:09
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-4.

Done: nothing yet; a coder is rewriting claude/coder-fleet/hooks/README.md and opencode/docs/divergence-register.md as present-tense reference. Not done: both still read partly as a change log.
---

created: 2026-10-18 13:29
---
Sub-issue 1 of 1: ready to merge in PR #103, pending review. Done still needs: criteria 1-4 proven on main, review.

Done (coder's word): hooks README items keep their numbers and state each hook as it is now; observed behaviour is stated with its probe, not its date; drifted facts corrected (gate timeout 480, matcher covers every fleet agent but the lead, line references replaced by function names). Register rows state the current divergence and reason only; the 2.x tables keep their facts. New docs/decisions/denial-tests-name-the-denial.md carries the one reason the history held. check-all exit 0 (282.5 s). Not done: review; merge.
---
<!-- COMMENTS:END -->
