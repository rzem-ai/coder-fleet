---
id: CF-183
title: >-
  Keep board and memory commits off main until a release tag, then land them as
  one commit
status: To Do
assignee: []
created_date: '2026-11-08 02:49'
labels:
  - board
  - hooks
dependencies: []
references:
  - claude/coder-fleet/board/src/git/operations.ts
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/agents/lead.md
  - docs/board-config.md
  - docs/limits.md
priority: High
type: enhancement
ordinal: 307000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 8 Nov 2026: "currently a project that uses this plugin has a git history that is polluted by commits related to memories and boards. to clean this up, I would like all these changes to be made on a worktree and only pushed as a single commit when a new tag is added" - and, pointing at Fathom: "look at the fathom repo `/Users/alex/Dev/Work/fathom/fathom` as an example".

Seen on Fathom, 8 Nov 2026: of the last 300 commits on main, about 190 are board auto-commits (Add a comment to, Move, Create, Reorder tasks in Next, Tick action) and 82 touch .claude/agent-memory/; 11 of the 15 newest commits on main are board writes. The board binary's commitBoard (claude/coder-fleet/board/src/git/operations.ts) commits .boards on whatever branch the main checkout has out, and memory rides each feature PR (lead.md step 5, coder.md and scripter.md).

Shape: a dedicated state worktree on its own branch holds the live board and the agents' memory and takes every per-write commit; nothing board- or memory-shaped lands on main or in a feature branch between releases; when a release tag is pushed, the state branch's delta lands on the default branch as one commit and is pushed.

Related: CF-169 (board writes out of agent worktree branches) - its criterion 1 assumes the main checkout's .boards is the live board, which this card replaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Between releases, no board write and no agent memory write creates a commit on the default branch or on any feature branch; a test with a real linked worktree pins both
- [ ] #2 Every board write the binary makes (CLI, MCP, hooks, web UI) reads and writes the state worktree's .boards and auto-commits there, and every reader - hooks, MCP server, web UI - sees the same live board whichever checkout or agent worktree it runs from
- [ ] #3 Agent memory written by any agent, in the main checkout or an agent worktree, lands in the state worktree and is committed there, and the scope hook still confines each agent to its own memory directory
- [ ] #4 When a release tag is pushed, one command lands the state branch's changes since the last flush on the default branch as exactly one commit, pushes it, and leaves the state branch based on the new default branch; with nothing to flush it makes no commit
- [ ] #5 The flush never rewrites or force-pushes the default branch, and on a push race it re-fetches and retries rather than overwriting
- [ ] #6 lead.md's shipping step runs the flush at tag time, and a project that never tags has a documented manual way to flush
- [ ] #7 /coder-fleet:init and /coder-fleet:kickoff create the state worktree, and an existing project such as Fathom migrates to it with one documented step that loses no uncommitted board or memory change
- [ ] #8 A merged feature branch carries no .boards or .claude/agent-memory changes, and review-round's scope lane reports any it finds
- [ ] #9 docs/board-config.md, docs/fleet-design.md and help-boards say where board and memory writes go and when they reach the default branch
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
