---
id: CF-158
title: >-
  Strip claudecode-agents and shared memory, and cut the top-level README to the
  facts
status: In Progress
assignee: []
created_date: '2026-10-18 06:58'
updated_date: '2026-10-18 07:02'
labels: []
dependencies: []
priority: High
type: docs
ordinal: 293000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-18: "remove all references to `claudecode-agents`, no one ever used it apart from me. in the top level README, there is too much detail around Claude Code, these details MUST be moved to the live under `./claude`. The memeory stuff was supposed to be unreferenced. Memories are to be TOTALLY under the perview of the harness, not this plugin. The top level README must be "Just the facts", and how to install, with links to the implementation specific versions"
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No file outside .boards/ and git history mentions claudecode-agents, including the old-path migration in claude/scripts/install-home.sh and its eval, the marketplace.json and the looping skills
- [ ] #2 The top-level README holds only what the fleet is, the harness table, how to install each port and links to each port's own README; every Claude Code detail (agent table, hooks, board, workflows, commands, layout) lives in claude/README.md, which the top-level README links
- [ ] #3 No shipped file in the repo wires, configures or instructs use of a shared memory server or corpus (rzem-memory, the claude_ai_Memory tools, a memory token, Propose memory): the OpenCode port's agents, commands, skills, scope.ts, tests, install-home.sh and docs included; memory is left entirely to the harness
- [ ] #4 The OpenCode install path in the docs no longer needs a memory token or install-home.sh step for memory
- [ ] #5 bash claude/evals/lib/check-all.sh passes, and the OpenCode unit tests pass
- [ ] #6 Live docs (READMEs, AGENTS.md, docs/fleet-design.md and other docs, skills, agent bodies) are present tense only: no 'was X until Y', 'as vX did', CF-nn backstory or rename lore; a reason that materially matters gets its own topic doc, linked from where the rule is stated
- [ ] #7 docs/runs/, docs/findings/, specs for Done cards and the port plans and findings are deleted after anything materially important is extracted into topic docs; docs/runs/ is in .gitignore, and the run-article skill, the lead body, the glossary and any check that assumed committed articles say they are local and unversioned
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
created: 2026-10-18 06:58
---
Decisions for the build (lead defaults, 2026-10-18): (1) Per-agent memory the harness provides natively (Claude Code `memory: project` frontmatter, .claude/agent-memory/) stays: it is the harness's own feature, not the plugin's. Only the shared memory server/corpus goes. (2) If install-home.sh in the OpenCode port has nothing left once the memory token and MCP merge are gone, delete it and drop it from the docs. (3) The fleet-design.md and glossary may keep a one-line statement that memory belongs to the harness; historical docs under docs/runs, docs/findings and specs are history and are left alone unless they are live instructions. (4) CF-157 (ports onto per-agent memory) is consistent with this, since it is harness-native memory.
---

created: 2026-10-18 07:02
---
The human, 2026-10-18: "History is to go. If it is materially important, then it should have it's own documentation for that matter." Clarified by AskUserQuestion: "#2, with an an easy tweak, `docs/runs/` is added to gitignore". This supersedes decision (3) in comment #1: history files are deleted after extraction, not kept, and live docs are present tense only.
---
<!-- COMMENTS:END -->
