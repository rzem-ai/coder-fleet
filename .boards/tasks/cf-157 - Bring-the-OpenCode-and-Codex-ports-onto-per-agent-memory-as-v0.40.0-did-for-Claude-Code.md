---
id: CF-157
title: >-
  Clean the retired OpenCode memory wiring off machines that installed it, and
  record that OpenCode leaves memory to the harness
status: To Do
assignee: []
created_date: '2026-10-18 04:00'
updated_date: '2026-10-18 07:05'
labels:
  - ports
dependencies:
  - CF-158
priority: Medium
ordinal: 292000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word on 2026-10-18, after v0.40.0 (PR #90) moved the Claude Code plugin off the claude.ai Memory connector onto memory: project, one .claude/agent-memory/<agent>/ directory per agent, and dropped the Propose memory: handoff line. The ports still describe the old model: opencode/coder-fleet agents, the handoff, glossary, compound and migration-checklist skills, the init and kickoff commands, lib/scope.ts, scripts/install-home.sh (the memory token) and install-project.sh, the invariant tests, and codex/docs/specs/GPTA-1.md. The OpenCode divergence register rows for glossary's Memory and Handoff meanings and for compound record keeping the shared rzem-memory corpus as deliberate, because OpenCode has no memory: frontmatter key; this card overturns that and the port needs its own way to give each agent a memory directory it alone writes, such as the enforcement plugin plus instructions. Port work never writes to claude/coder-fleet/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A machine that already ran the old opencode/scripts/install-home.sh is cleaned once by a shipped script: the rzem-memory entry leaves ~/.config/opencode/opencode.json with every other mcp entry kept, and ~/.config/claude-agents/memory-token is removed (and the directory if empty), proven by a failing-first test against a fixture home; re-running it is a no-op
- [ ] #2 The OpenCode divergence register has a row saying the port gives agents no per-agent memory because OpenCode has no memory frontmatter key and memory belongs to the harness, not the plugin; the old rows keeping the shared rzem-memory corpus are gone
- [ ] #3 The OpenCode README's install steps say how to run the cleanup on a machine that installed the old memory wiring
- [ ] #4 The OpenCode invariant tests and bash claude/evals/lib/check-all.sh pass
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-18 07:05
---
Rescoped by the human, 2026-10-18, via AskUserQuestion: "Rescope, start after 158". Reason: the human ruled on CF-158 that "Memories are to be TOTALLY under the perview of the harness, not this plugin", so the old criterion 1 (the OpenCode enforcement plugin giving each agent its own memory directory) is dropped: OpenCode has no harness memory and the plugin will not supply one. The old criteria 3, 5, 6 and 8 (removing the connector, token, Propose memory line and doc wording) are covered by CF-158 criterion 3. Build starts once CF-158's PR is up, from its branch or main after merge.
---
<!-- COMMENTS:END -->
