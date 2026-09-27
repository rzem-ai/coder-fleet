---
id: CF-46
title: Check whether the OpenCode port needs the resume binding rule
status: To Do
assignee: []
created_date: '2026-09-27 07:34'
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
