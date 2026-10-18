---
id: CF-160
title: >-
  Rewrite the hooks README and the OpenCode divergence register as present-tense
  reference
status: To Do
assignee: []
created_date: '2026-10-18 07:49'
labels: []
dependencies: []
type: docs
ordinal: 295000
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
