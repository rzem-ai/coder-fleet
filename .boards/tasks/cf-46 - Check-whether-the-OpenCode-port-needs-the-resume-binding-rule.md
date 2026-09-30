---
id: CF-46
title: Check whether the OpenCode port needs the resume binding rule
status: To Do
assignee: []
created_date: '2026-09-27 07:34'
updated_date: '2026-09-30 14:02'
labels: []
dependencies:
  - CF-30
priority: Low
type: task
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-30 coder. CF-30 makes a resumed Claude Code subagent keep the board item its first SubagentStart bound. Check whether the OpenCode port binds subagents to board items at all (opencode/coder-fleet has no board-conventions copy); if it does, port the rule or record a Deferred row in opencode/docs/divergence-register.md. Port work reads the Claude Code tree and never writes it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The OpenCode port's board binding is described with evidence (file and line), or its absence is
- [ ] #2 Either the resume rule is ported with its test, or divergence-register.md has a Deferred row with the reason
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
