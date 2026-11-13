---
id: CF-207
title: >-
  A new board mod for Claude Code: markdown cards kept in the home directory,
  the coder-fleet workflow, per-card locks, an event trail and atomic writes
status: In Progress
assignee: []
created_date: '2026-11-13 08:51'
updated_date: '2026-11-13 10:41'
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

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-13 08:59
---
The human's change to the columns, 13 Nov 2026, quoted:

```
"To Do"               -> "Backlog"            -> just a rename
"Next"                -> "Next"               -> no change
"In Progress"         -> "In Progress"        -> no change
"Done" {new column}   -> {new column}         -> this is where all "done" cards move to but have yet to be coded and awaiting final test results
"Blocked"             -> "Blocked"            -> no change
"Blocked by Human"    -> "Blocked by Human"   -> no change
"Done" {original}     -> "Released"           -> what constitutes Done now
```

This replaces the card's seven columns. Released is the final state, what Done meant before. A new column sits between In Progress and Released, for cards whose work is finished but whose final test results are still pending. Draft is not in the list. Its name, whether Draft goes, and which gate moves a card into each column are being asked of the human in the session.
---

author: lead
created: 2026-11-13 09:01
---
The human's answers on the columns, 13 Nov 2026. There are eight columns in this order: Draft, Backlog (formerly To Do), Next, In Progress, Done, Released, Blocked, Blocked by Human.

- The new column between In Progress and Released is called Done. Released is the final state.
- Ticks in, tests out: a card moves to Done when every criterion and Definition of Done item is ticked, which is the card gate. It moves from Done to Released when the project's test suite passes on the release that names it, which is the test gate. The slow suite therefore never holds a session's turn just to close a card.
- Draft stays, as the column ahead of Backlog.
---

author: lead
created: 2026-11-13 09:07
---
The human's interview answers, 13 Nov 2026, part 1:
- This card delivers the spec and the whole working mod. The lead will still split the build into sub-issues, each with its own criteria, under this card.
- The problem it solves: neither existing board has the combination of features the human picked, and this one does.
- It is standalone. It works with any Claude Code setup and defines its own report format, including how it spots a Blocker line.
- The code lives in its own new repo, as its own plugin.
- A board is tied to its repo by the origin remote's URL. The spec must say what happens for a repo with no remote, and for a fork.
- Card ids: the human is asked for the prefix when a board is created. Then a dash, a number handed out under the board-wide lock, dotted numbers for sub-issues, and numbers are never reused.
- Draft: anyone can file into it or move a card out of it.
- Only the human fills Next, and those moves can only be made in the web UI.
- Importing or moving any existing board into this one is a non-goal. The human said nothing about this mod should talk about migration paths.
---

author: lead
created: 2026-11-13 09:28
---
The human's interview answers, 13 Nov 2026, part 2:
- The test command lives in the board's own config in ~/.claude, not in the repo.
- When a release moves Done cards to Released, the mod first reuses a green run recorded for the same commit. If there is none, it runs the suite in the background and moves the cards when it passes. A failure moves them to Blocked, with the output as a comment.
- A release names the cards it carries in the annotated tag's message, and the move fires when the tag is pushed.
- A writer that hits a held lock waits a few seconds, then fails, naming the card and who holds the lock. A lock left by a dead process is broken after a timeout.
- The event trail keeps every line forever.
- The web UI does full editing: titles, descriptions, criteria, comments and moves. The human chose the design: the Ledger canvas at https://claude.ai/artifact/V6YMifMqcQcg1ahzNFFCx5 (its title is "Kanban Board Refresh - Ledger"; shadcn/ui; laptop, desktop and ultrawide boards, card detail, dark mode, and empty, dragging and loading states). It shows six columns. My default, easy to reverse: the same design, extended to the mod's eight columns, adding no structure the design does not have.
- The project-wide default criteria and Definition of Done live in the board config and are read live, so changing a default changes every open card.
- Runtime: Bun, built as one binary for macOS and Linux.
---

author: lead
created: 2026-11-13 10:40
---
The human, 13 Nov 2026: "just replace the old board system". This overrides the earlier answers that the mod is standalone and lives in its own new repo.

The mod is built in the coder-fleet repo and replaces coder-fleet's current board system: the board binary, its MCP server and CLI, its hooks, the state branch and `.boards/`. It reads coder-fleet's agents and their handoff format, including `Blocker:` lines. The card's coder-fleet Definition of Done applies as it stands. Every other answer in comments #2 to #4 still holds.

The spec-writer's three blocking questions resolve as follows. My defaults are taken from what the current board does, and each is easy to reverse:
- Definition of Done: the card's own, unchanged.
- The card gate moves a card to Done when a hook fires: an agent stops, or a task completes. A tick tool never moves a column.
- A release tag push is caught by the Claude Code hook in a session. A push made outside a session is picked up at the next session start, as CF-205's session-start listing does today.

One more default: a card leaving Blocked or Blocked by Human returns to the column it was blocked from, read from the event trail. A card leaves Blocked by Human once every Action for Human on it is ticked.

The human ruled out talking about migration paths. What happens to the cards already on this repo's board is left as an open question in the spec, for the human's edit pass.
---

author: lead
created: 2026-11-13 10:41
---
The spec at docs/specs/CF-207.md is revised for "replace the old board system". It has 56 acceptance criteria in groups A to J and no blocking questions, and its status is revised, not yet approved. Its defaults are marked [lead's default].

The spec-writer flags open question 1 to settle before the group G sub-issue (removing the old board) is cut: the state branch also carries agent memory and specs today, so replacing it affects where memory and specs persist.

Proposed by the spec-writer, not filed: if the OpenCode port keeps its own board wiring after this lands, a separate card to replace it there (open question 15). Filed only if the human says so.

Next: one spec-editor pass, then the human edits and approves.
---
<!-- COMMENTS:END -->
