---
id: CF-168
title: Prefix coder-fleet's workflow names so the agent list shows whose they are
status: To Do
assignee: []
created_date: '2026-10-22 01:35'
labels:
  - workflows
dependencies: []
priority: Low
ordinal: 292000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, watching a Fathom session: the running-agents list showed "coder-fleet:reviewer" beside a bare "review-round" and he read them as two separate review processes; "coder-fleet:review-round gets shortened to just review-round which caused me some confusion". He asked for this card: "yes, file it in coder-fleet".

Cause: an agent is listed by its plugin-qualified type, but a workflow is listed by the name in its script's own meta block, and all three shipped workflows declare a bare name - claude/coder-fleet/workflows/review-round.js:2 name: 'review-round', deep-research.js:2 'deep-research', spec-to-card.js:2 'spec-to-card'. They are invoked as coder-fleet:<name>, so the list and the invocation disagree.

Check before changing: whether anything keys on the bare meta.name (hooks, the evals, docs, the workflow-authoring rule that meta is a pure literal, resume by runId) and whether a colon is allowed in meta.name.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each workflow shipped under claude/coder-fleet/workflows/ shows in the running-agents list with a name that says it is coder-fleet's (e.g. coder-fleet:review-round)
- [ ] #2 Nothing that reads a workflow's meta.name breaks: hooks, evals and docs that name the workflows are updated in the same change, and a check pins the prefix on every shipped workflow
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
