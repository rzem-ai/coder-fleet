---
id: CF-46
title: Check whether the OpenCode port needs the resume binding rule
status: Done
assignee: []
created_date: '2026-09-27 07:34'
updated_date: '2026-10-18 03:55'
labels: []
dependencies:
  - CF-30
priority: Low
type: task
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-30 coder. CF-30 makes a resumed Claude Code subagent keep the board item its first SubagentStart bound. Check whether the OpenCode port binds subagents to board items at all (opencode/coder-fleet has no board-conventions copy); if it does, port the rule or record a Deferred row in opencode/docs/divergence-register.md. Port work reads the Claude Code tree and never writes it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The OpenCode port's board binding is described with evidence (file and line), or its absence is
- [x] #2 Either the resume rule is ported with its test, or divergence-register.md has a Deferred row with the reason
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-07 03:54
---
Triage 2026-10-07 against main, recorded on the human's word: partly met, nothing ticked. opencode/docs/divergence-register.md:22 records the port's missing binding (the skills/board row is Deferred: the page-id variable binds at launch, and SubagentStart logs to a file never written). Still open: no register row or port text covers the resume binding rule itself.
---

created: 2026-10-18 03:55
---
Ticks on main, PR #91 (rzem-ai/coder-fleet), merged to main as e827588. #1: the port binds no subagent to a board item. opencode/coder-fleet/plugin/fleet.ts registers only experimental.chat.system.transform (line 106) and tool.execute.before (line 118), so no event records a start, and no agent body reads or carries a binding. #2: the register's resume-binding row (CF-30, CF-46) is Deferred with that reason. DoD #1 by CI deterministic green on the PR head 7b12fef, which ran check-all.sh and check-slow.sh. DoD #2: No fleet reviewer or refuter round ran: the session worked under the human's order to finish the port without stopping, the Codex review bot reviewed the PR and its one finding was fixed in 4c5c35a, and the human merged it. DoD #3 not applicable: no Claude Code agent body or skill frontmatter changed, and the port's migration-checklist is deferred with fleet-steward. DoD #4 not applicable: nothing under claude/coder-fleet/ changed, and the version is the Claude Code plugin's. DoD #5 by the resume-binding row. DoD #6 not applicable: no spec of its own; the port's spec is opencode/docs/specs/opencode-agents-port.md.
---
<!-- COMMENTS:END -->
