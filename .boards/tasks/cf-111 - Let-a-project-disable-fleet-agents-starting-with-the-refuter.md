---
id: CF-111
title: 'Let a project disable fleet agents, starting with the refuter'
status: In Progress
assignee: []
created_date: '2026-10-04 08:55'
updated_date: '2026-10-04 08:57'
labels: []
dependencies: []
priority: Medium
type: feature
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's words (2026-10-04): "can we add a feature to disable certain agents. first test case is to be able to enable/disable the refuter from being part of the development flow".

A general mechanism for switching individual fleet agents off, proven first on the refuter. Spec to follow (docs/specs/<id>.md) once the design questions are answered; criteria below are provisional, written from the human's words.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A project can mark the refuter disabled, and while it is disabled no part of the development flow (the lead's escalation policy, review-round, any other workflow) spawns a refuter
- [ ] #2 Re-enabling the refuter restores today's behaviour with no other change
- [ ] #3 The mechanism is general: disabling another agent uses the same setting, not a refuter-specific switch
- [ ] #4 A PreToolUse hook denies an Agent spawn whose subagent type is on the project's disabled list, with a message naming the config file, and has a contract test under claude/evals/lib/
- [ ] #5 Listing lead, coder or reviewer as disabled is rejected, and the rejection is tested
- [ ] #6 The refuter DoD default and lead.md step 4 both say what happens when the refuter is disabled (no substitute gate run), and README or fleet-design documents the config file
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
author: lead
created: 2026-10-04 08:57
---
Decisions from the human, 2026-10-04 session (the coder builds from these):
1. Location: a committed project-level fleet config file in the repo. Each project chooses; no user-level setting.
2. Enforcement: advisory AND hard. The lead body and every workflow read the disabled list and do not spawn a disabled agent; a PreToolUse hook also denies an Agent spawn of a disabled type, with a message naming the config file.
3. Fallback when the refuter is disabled: skip entirely. No substitute independent gate run is commissioned in its place (review-round with refute disabled does not swap in extra gate lanes beyond what it runs for a non-refuter change today; the lead does not run the gates in its stead).
4. Scope: any agent may be disabled except lead, coder and reviewer; an attempt to disable one of those is rejected (hook and check-all both say so).
Knock-on to handle: the default DoD item 'a refuter round ran where lead.md step 4 calls for one' must read as satisfied when the project has disabled the refuter.
---
<!-- COMMENTS:END -->
