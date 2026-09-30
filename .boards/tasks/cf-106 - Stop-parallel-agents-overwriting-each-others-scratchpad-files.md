---
id: CF-106
title: Stop parallel agents overwriting each other's scratchpad files
status: To Do
assignee: []
created_date: '2026-09-30 10:30'
updated_date: '2026-09-30 14:03'
labels:
  - agents
dependencies: []
priority: Low
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-90 fix round 2 (2026-09-30). Every subagent in a session shares the session's scratchpad directory. With three coders and two refuters running in parallel, one agent's `migration.py` was overwritten by another's (it ended up targeting lead.md and fleet-steward.md, not reviewer.md). Nothing broke because the coder noticed and renamed, but a silent overwrite of a mutation script or a captured gate output would make a handoff claim rest on the wrong file. Refuters already use a unique `refuter-<epoch>` subdirectory; coders and scripters don't.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The coder and scripter bodies (and any other agent that writes scratch files) say to write scratch files only under a subdirectory unique to the run, such as `<agent>-<item>-<epoch>`, never at the scratchpad root
- [ ] #2 The lead's spawn briefs need not say it, because the agent bodies do
- [ ] #3 bash claude/evals/lib/check-all.sh passes and the migration-checklist is run over each changed body
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
