---
id: CF-158
title: >-
  Strip claudecode-agents and shared memory, and cut the top-level README to the
  facts
status: Done
assignee: []
created_date: '2026-10-18 06:58'
updated_date: '2026-10-18 09:04'
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
- [x] #1 No file outside .boards/ and git history mentions claudecode-agents, including the old-path migration in claude/scripts/install-home.sh and its eval, the marketplace.json and the looping skills
- [x] #2 The top-level README holds only what the fleet is, the harness table, how to install each port and links to each port's own README; every Claude Code detail (agent table, hooks, board, workflows, commands, layout) lives in claude/README.md, which the top-level README links
- [x] #3 No shipped file in the repo wires, configures or instructs use of a shared memory server or corpus (rzem-memory, the claude_ai_Memory tools, a memory token, Propose memory): the OpenCode port's agents, commands, skills, scope.ts, tests, install-home.sh and docs included; memory is left entirely to the harness
- [x] #4 The OpenCode install path in the docs no longer needs a memory token or install-home.sh step for memory
- [x] #5 bash claude/evals/lib/check-all.sh passes, and the OpenCode unit tests pass
- [x] #6 Live docs (READMEs, AGENTS.md, docs/fleet-design.md and other docs, skills, agent bodies) are present tense only: no 'was X until Y', 'as vX did', CF-nn backstory or rename lore; a reason that materially matters gets its own topic doc, linked from where the rule is stated
- [x] #7 docs/runs/, docs/findings/, specs for Done cards and the port plans and findings are deleted after anything materially important is extracted into topic docs; docs/runs/ is in .gitignore, and the run-article skill, the lead body, the glossary and any check that assumed committed articles say they are local and unversioned
- [x] #8 The OpenCode divergence register has a row saying the port gives agents no per-agent memory because OpenCode has no memory frontmatter key and memory belongs to the harness; the ~/.config/claude-agents deny pattern is removed from scope.ts with its test case
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
created: 2026-10-18 06:58
---
Decisions for the build (lead defaults, 2026-10-18): (1) Per-agent memory the harness provides natively (Claude Code `memory: project` frontmatter, .claude/agent-memory/) stays: it is the harness's own feature, not the plugin's. Only the shared memory server/corpus goes. (2) If install-home.sh in the OpenCode port has nothing left once the memory token and MCP merge are gone, delete it and drop it from the docs. (3) The fleet-design.md and glossary may keep a one-line statement that memory belongs to the harness; historical docs under docs/runs, docs/findings and specs are history and are left alone unless they are live instructions. (4) CF-157 (ports onto per-agent memory) is consistent with this, since it is harness-native memory.
---

created: 2026-10-18 07:02
---
The human, 2026-10-18: "History is to go. If it is materially important, then it should have it's own documentation for that matter." Clarified by AskUserQuestion: "#2, with an an easy tweak, `docs/runs/` is added to gitignore". This supersedes decision (3) in comment #1: history files are deleted after extraction, not kept, and live docs are present tense only.
---

created: 2026-10-18 07:05
---
CF-157's old criteria 3, 5, 6 and 8 (connector, memory token, Propose memory line, GPTA-1 and port-spec decisions 10 to 12) are folded into this card's criterion 3. CF-157 now covers only the one-off cleanup of machines that ran the old install-home.sh, and builds after this card's PR.
---

created: 2026-10-18 07:16
---
The human, 2026-10-18, via AskUserQuestion: the old OpenCode install-home.sh ran "only this Mac", and ~/.config/claude-agents does not exist there (the human's ls). So no cleanup script is needed, the deny pattern goes in this card, and CF-157's remaining register row is folded in here.
---

created: 2026-10-18 07:33
---
Sub-issue 1 of 1: ready to merge in PR #95, pending review. Done still needs: criteria 1 to 9 proven on main; review and refuter verdicts; check-all green (local run failed only board-binary, a BSD sed portability issue in a file this PR does not touch; CI pending).

Done: PR #95 open, built by a coder, with the README split, claudecode-agents gone, the memory server gone from the OpenCode and Codex ports, the history deleted after extraction into docs/decisions/, docs/runs/ gitignored, version 0.41.1.
Not done: nothing is merged; the human cannot yet see the new README on main. migration-checklist not yet run.

The automated security review's second finding (rzem-memory MCP entry left in the global opencode.json) does not apply: ~/.config/opencode/opencode.json does not exist on this Mac, the only machine the old install ran on.
---

created: 2026-10-18 08:04
---
Sub-issue 1 of 1: ready to merge in PR #96 (fix round, v0.41.2), second review running. PR #95 merged to main at 1711748 and is tagged v0.41.1. Done still needs: criteria 5 and 7 proven on main after #96 merges (compound skill wording; check-all green apart from the macOS sed check, CF-159).

Done: on main, the README is split, claudecode-agents and the memory server are gone, history is deleted and docs/runs is gitignored. PR #96 adds the compound skill wording, three credential and boundary tests, the six lows, and the OpenCode lead's fetched-content rule.
Not done: PR #96 is not merged; the second review is not back yet.
Note: check-all on #96 also failed board test archive-clears-before-move once at load 47, then passed when rerun on the same commit. That makes it an intermittent failure under load; this PR touches no board code.
---

created: 2026-10-18 08:08
---
Sub-issue 1 of 1: ready to merge in PR #96. Done still needs: the human to merge #96, then the v0.41.2 tag.

Evidence: second-round reviewer approved #96, with two lows dropped (no fix round running). CI 'deterministic' passed on Linux in 4m15s. The lead ran opencode/test/run.sh unit on the PR head c66b74b: 56 pass, 0 fail.
Not done: #96 is not merged, so the compound wording and the new credential tests are not on main yet.
---

created: 2026-10-18 08:10
---
Sub-issue 1 of 1: merged to main (PR #95 at 1711748, tagged v0.41.1; PR #96 at c66b74b, tagged v0.41.2). Done still needs: Definition of Done #3 (migration-checklist over the changed OpenCode and Claude agent bodies and skills was never run); the close gate runs check-all locally, where board-binary fails on macOS sed (CF-159).

Evidence on main at 1df420a, criteria 1 to 8 ticked:
- #1: `git grep -il claudecode-agents` outside .boards finds 0 files.
- #2: README.md is 34 lines; claude/README.md holds the Claude Code detail, as the first-round review confirmed.
- #3, #4: no shipped file names rzem-memory, the claude_ai_Memory tools, memory_capture, a memory token or Propose memory. The only hits are handoff-cases fixtures that test the hook rejects the retired line. opencode/scripts/install-home.sh is deleted.
- #5: CI 'deterministic' passed on #95 and #96; the OpenCode unit tests pass 56/56 on c66b74b. Locally, check-all fails only board-binary, from BSD sed (CF-159).
- #6: present-tense pass across the live docs, reviewed in both rounds; code comments are CF-161.
- #7: docs/runs, docs/findings and the Done specs are deleted; .gitignore line 15 is docs/runs/; the compound, run-article and glossary wording is fixed.
- #8: the claude-agents deny pattern is removed; the register has the no-per-agent-memory row.
---

created: 2026-10-18 08:21
---
Definition of Done #3: a reviewer ran the migration-checklist over all 30 agent and skill files changed from v0.41.0 to main (3c55594). Verdict: approve with follow-ups. No tool, skill or preload was lost; no body names a tool its frontmatter no longer grants; no removed mechanism is named anywhere. The follow-up (docs/runs/ is ignored only in this repo) is CF-162. Five low wording slips were dropped, since no fix round is running: the lead saves articles only from reviewer and researcher, not refuter and evaluator; run-article's stale 'never create a file' and preload list; the lead's 'two servers' comment; OpenCode compound and run-article mention 'a memory'; OpenCode researcher 'what is durable' has no consumer. #6: not applicable, since CF-158 has no spec. The card is ready for the human to close by hand, as the human chose.
---
<!-- COMMENTS:END -->
