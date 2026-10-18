---
id: CF-157
title: >-
  Bring the OpenCode and Codex ports onto per-agent memory, as v0.40.0 did for
  Claude Code
status: To Do
assignee: []
created_date: '2026-10-18 04:00'
updated_date: '2026-10-18 04:03'
labels:
  - ports
dependencies: []
priority: Medium
ordinal: 292000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word on 2026-10-18, after v0.40.0 (PR #90) moved the Claude Code plugin off the claude.ai Memory connector onto memory: project, one .claude/agent-memory/<agent>/ directory per agent, and dropped the Propose memory: handoff line. The ports still describe the old model: opencode/coder-fleet agents, the handoff, glossary, compound and migration-checklist skills, the init and kickoff commands, lib/scope.ts, scripts/install-home.sh (the memory token) and install-project.sh, the invariant tests, and codex/docs/specs/GPTA-1.md. The OpenCode divergence register rows for glossary's Memory and Handoff meanings and for compound record keeping the shared rzem-memory corpus as deliberate, because OpenCode has no memory: frontmatter key; this card overturns that and the port needs its own way to give each agent a memory directory it alone writes, such as the enforcement plugin plus instructions. Port work never writes to claude/coder-fleet/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each OpenCode agent reads and writes its own memory directory in the project, and the port's enforcement plugin denies a write into another agent's directory, proven by a failing-first case in opencode/test/invariants/scope.test.ts
- [ ] #2 The divergence register's Memory, Handoff and compound rows are rewritten or removed to match, with the reason for any divergence that remains
- [ ] #3 codex/docs/specs/GPTA-1.md describes per-agent memory and the two-prefix handoff rather than the connector
- [ ] #4 The OpenCode invariant tests and bash claude/evals/lib/check-all.sh pass
- [ ] #5 The vendored handoff skill and every OpenCode agent body name only the Blocker: and Propose item: prefixes, and lib/scope.ts no longer tells an agent to write a Propose memory: line
- [ ] #6 No agent, skill or command under opencode/coder-fleet/ names the Memory connector, a memory token, memory_capture, a shared memory corpus or a Propose memory: line, and no install script writes any of them; a script names them only to remove them
- [ ] #7 A machine that already ran opencode/scripts/install-home.sh is cleaned once: the rzem-memory entry leaves ~/.config/opencode/opencode.json with every other mcp entry kept, and ~/.config/claude-agents/memory-token is removed, proven by a test against a fixture home
- [ ] #8 opencode/docs/specs/opencode-agents-port.md decisions 10 to 12 (the memory credential, the rzem-memory key and the corpus write lock), README.md and docs/fleet-design.md stop describing the OpenCode memory token and connector
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
