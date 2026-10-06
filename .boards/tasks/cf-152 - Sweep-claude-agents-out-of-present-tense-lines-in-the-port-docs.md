---
id: CF-152
title: Sweep claude-agents out of present-tense lines in the port docs
status: To Do
assignee: []
created_date: '2026-10-06 14:13'
labels: []
dependencies: []
priority: Low
type: docs
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the scripter on CF-2, 2026-10-07. CF-2 swept `claudecode-agents` and the author's name out of present-tense lines under opencode/docs and codex/docs. The older name `claude-agents` (without `code`) remains in many present-tense lines there, for example the spec and plan titles in opencode/docs/specs/opencode-agents-port.md (lines 1, 43, 82, 232, 258), the divergence register and opencode/docs/measurements/runtime.md. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No line under opencode/docs or codex/docs that describes the present state of the port says `claude-agents`; lines recording history, a dated event or a verbatim quote keep their text, and the handoff lists each one left with file and line
- [ ] #2 Nothing outside opencode/docs and codex/docs changes
- [ ] #3 bash claude/evals/lib/check-all.sh passes on the branch
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
