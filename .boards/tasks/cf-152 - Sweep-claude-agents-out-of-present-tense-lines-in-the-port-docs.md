---
id: CF-152
title: Sweep claude-agents out of present-tense lines in the port docs
status: To Do
assignee: []
created_date: '2026-10-06 14:13'
updated_date: '2026-10-18 03:55'
labels: []
dependencies: []
priority: Low
type: docs
ordinal: 280000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the scripter on CF-2, 2026-10-07. CF-2 swept `claudecode-agents` and the author's name out of present-tense lines under opencode/docs and codex/docs. The older name `claude-agents` (without `code`) remains in many present-tense lines there, for example the spec and plan titles in opencode/docs/specs/opencode-agents-port.md (lines 1, 43, 82, 232, 258), the divergence register and opencode/docs/measurements/runtime.md. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No line under opencode/docs or codex/docs that describes the present state of the port says `claude-agents`; lines recording history, a dated event or a verbatim quote keep their text, and the handoff lists each one left with file and line
- [x] #2 Nothing outside opencode/docs and codex/docs changes
- [x] #3 bash claude/evals/lib/check-all.sh passes on the branch
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-18 03:55
---
Ticks on main, PR #91 (rzem-ai/coder-fleet), merged to main as e827588. #1: no present-tense line under opencode/docs or codex/docs says claude-agents. One line keeps it: opencode/docs/divergence-register.md:251, the kickoff row naming the fleet's old ~/.config/claude-agents/linear.token check as history beside ~/.config/claude-agents/memory-token, which is the real path opencode/scripts/install-home.sh renders. #2: the CF-152 edits touched only opencode/docs, though they landed in commit 6a6abf9 beside other cards' work. #3 as DoD #1. DoD #1 by CI deterministic green on the PR head 7b12fef, which ran check-all.sh and check-slow.sh. DoD #2: No fleet reviewer or refuter round ran: the session worked under the human's order to finish the port without stopping, the Codex review bot reviewed the PR and its one finding was fixed in 4c5c35a, and the human merged it. DoD #3 not applicable: no Claude Code agent body or skill frontmatter changed, and the port's migration-checklist is deferred with fleet-steward. DoD #4 not applicable: nothing under claude/coder-fleet/ changed, and the version is the Claude Code plugin's. DoD #5 by no row: a name sweep changes no ported artefact, so DoD #5 is satisfied by there being nothing to record. DoD #6 not applicable: no spec of its own; the port's spec is opencode/docs/specs/opencode-agents-port.md.
---
<!-- COMMENTS:END -->
