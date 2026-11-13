---
id: CF-207
title: >-
  A new board mod for Claude Code: markdown cards kept in the home directory,
  the coder-fleet workflow, per-card locks, an event trail and atomic writes
status: To Do
assignee: []
created_date: '2026-11-13 08:51'
labels: []
dependencies: []
references:
  - 'https://claude.ai/artifact/FQBiYaFTqvQVQRFcP7qvVG'
  - /Users/alex/Dev/Work/extensions/eigenwise-toolshed/plugins/sidequest
priority: Medium
type: feature
ordinal: 335000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human, 13 Nov 2026: "file it as a card and write the spec". This is a brand-new Claude Code mod, designed from scratch. It is not a change to coder-fleet's board or to sidequest, and the spec must not frame it as a move from either.

The human chose its features in the Board Feature Picker (https://claude.ai/artifact/FQBiYaFTqvQVQRFcP7qvVG), drawing on coder-fleet's board and the sidequest plugin (/Users/alex/Dev/Work/extensions/eigenwise-toolshed/plugins/sidequest).

Features kept:
- Cards as markdown files with frontmatter, one file per card.
- Stored in the human's home directory under ~/.claude, one board per repo, with git worktrees folded into their repo. The board never goes into git.
- Seven columns: Draft, To Do, Next, In Progress, Blocked, Blocked by human, Done. Next is the human's ordered queue: only the human puts a card there, and agents take it top first.
- Hooks own the columns. Agent start, agent stop and task completion move cards, and no agent writes a status. Focus binding ties the agents a checkout spawns to one card. A `Blocker:` line in an agent's report moves its card to Blocked by human, with the text as a comment.
- A card gate: Done only with every criterion and Definition of Done item ticked. A test gate: the project's suite must pass before a card closes. A card closes when a release tag names it, through both gates.
- Acceptance criteria and Definition of Done checklists, with project-wide defaults. Actions for Human: numbered questions on a card, and an open one holds it in Blocked by human. Sub-issues with dotted ids, dependencies, and a filter for cards whose dependencies are done.
- One binary serving the MCP tools and a CLI. A loopback web UI that lives only as long as the session.
- Per-card locks, plus a board-wide lock that hands out each card number exactly once. Atomic writes (temporary file then rename).
- An event trail: each card's last event and its source, plus a log of moves. The human chose this over a local git repo, so the old text of a card is not kept.
- Context hooks: a reminder to check the board first, and to reconcile before stopping, kept across compaction.

Left out on purpose: a git branch for the board, milestones and documents, a database, the claim/submit/oracle lifecycle, fenced status edits, two-way links and stories, rich work-scope fields, attachments, and an always-on dashboard.

Costs the human accepted: the board exists only on this machine, so other clones and web sessions can't see it and it isn't backed up with the repo. Every close runs the test suite, including a close on release from inside a hook, which holds the session's turn. The spec has to answer that, for example by running the release close in the background or reusing a recent green run.

Still open, for the spec:
- Where the mod lives: its own repo, or inside the coder-fleet repo.
- How a board is keyed to a repo, and what happens when the repo moves.
- The card id scheme.
- The event trail's format, and how much of it the web UI shows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional, until the spec is signed off: the spec defines the card file format and where boards live under the home directory, including how a repo and its worktrees map to one board
- [ ] #2 Provisional: the spec defines the seven columns, which hook moves a card between which columns, and the card gate and test gate, including how a close on release avoids holding the session's turn
- [ ] #3 Provisional: the spec defines the locking, atomic-write and card-numbering rules, and what a concurrent writer sees
- [ ] #4 Provisional: the spec defines the event trail's format and what records each move
- [ ] #5 Provisional: the spec defines the MCP tools, the CLI commands and the web UI's scope, and where the mod's code lives
- [ ] #6 Provisional: every feature the human left out stays out, and the spec never describes the mod as a move from coder-fleet's board or from sidequest
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
