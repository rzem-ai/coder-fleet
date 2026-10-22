---
id: CF-173
title: Refuse review-round free text that names no git range before spending an agent
status: To Do
assignee: []
created_date: '2026-10-22 08:55'
labels:
  - workflows
dependencies: []
priority: Low
ordinal: 297000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, after asking whether the plugin held the work back on Fathom FTH-285: "create cards for all those issues in coder-fleet please".

Seen on Fathom, 22 Oct 2026: the review-round skill turned the lead's free-text args "FTH-285.1 branch worktree-agent-aa3135a269a689ebe head 729594f9 base main worktree <path> round 1" into Workflow args as one string. The script read a string as { range }, the pin lane spent an agent trying to resolve the whole sentence as a commit, and the run stopped with "the reviewed head does not resolve". The lead had to read the script to learn the accepted keys and relaunch with { target, issue, round }.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 review-round refuses, before any agent runs, a string range that holds whitespace or does not look like a git range, naming the accepted keys and an example { target, issue, round } call
- [ ] #2 The review-round skill's invoke text shows the object form, and a string of key-value words such as 'FTH-285.1 branch X round 1' either maps to those keys or is refused with the same message
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
