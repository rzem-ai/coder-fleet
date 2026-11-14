---
id: CF-207
title: >-
  A new board mod for Claude Code: markdown cards kept in the home directory,
  the coder-fleet workflow, per-card locks, an event trail and atomic writes
status: In Progress
assignee: []
created_date: '2026-11-13 08:51'
updated_date: '2026-11-14 11:03'
labels: []
dependencies: []
references:
  - 'https://claude.ai/artifact/FQBiYaFTqvQVQRFcP7qvVG'
  - /Users/alex/Dev/Work/extensions/eigenwise-toolshed/plugins/sidequest
  - docs/specs/CF-207.md
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
- [ ] #1 Claude Code reading and writing subagent memory through a symlinked `.claude/agent-memory` is undocumented, so before any other group is built, a test proves it. With the repo's `.claude/agent-memory` symlinked to `~/.config/boards/<key>/memory`, a subagent with `memory: project` is given a note placed in the board's memory directory and quotes it back, and a note it writes lands in the board's memory directory, not in the checkout. The test passes in the main checkout and again in a linked worktree. (card: the human's choice of mechanism) If it fails, nothing that depends on criterion 51 is built until the human has chosen again. [supplied: the last sentence]
- [ ] #2 Every card is one markdown file with YAML frontmatter. A repo's board lives in one directory, `~/.config/boards/<key>/`, holding its cards, config, event log, locks, test-run logs, specs and agent memory. (card: "boards and board config should live in `~/.config/boards`") When `XDG_CONFIG_HOME` is set, `$XDG_CONFIG_HOME/boards/<key>/` is used instead. [lead's default: `XDG_CONFIG_HOME`, and specs and memory in the board's directory] [supplied: the rest of the layout]
- [ ] #3 After any operation through the MCP tools, the CLI or the web UI, `git status` in the repo and in each of its worktrees shows no file written by the board.
- [ ] #4 A repo's main checkout and every linked worktree of it read and write the same board.
- [ ] #5 A board is keyed by the repo's origin remote URL, so moving or re-cloning the repo on the same machine reaches the same board. Two spellings of the same remote (SSH and HTTPS) reach the same board. [supplied: the URL normalisation]
- [ ] #6 A repo with no origin remote gets a board keyed by the absolute path of its shared git directory, and that board is used from the main checkout and every worktree. When such a repo later gains an origin remote, its board moves to the URL key once, the first time the board sees the remote. [lead's default for the first sentence] [supplied: the second]
- [ ] #7 A fork, whose origin is the fork's own URL, gets its own board, separate from the upstream repo's. [lead's default]
- [ ] #8 A board is created only through the CLI or the web UI, which ask the human for the board's id prefix. (card: the prefix question) An agent in a repo with no board gets a message telling it to ask the human to create one. [supplied]
- [ ] #9 Card ids are the prefix, a dash and a number (for example `XY-12`). Sub-issues carry dotted ids under their parent (`XY-12.1`, `XY-12.2`). A number is never reused, including after a card is deleted.
- [ ] #10 Anyone may delete a card through any interface; its file goes and the event log keeps a line for the deletion. [supplied]
- [ ] #11 When no board can be found for the session (for example a Claude Code web session, whose `~/.config/boards` has none), the board's hooks do nothing and say so once per session. [lead's default]
- [ ] #12 Many processes creating cards on the same board at once never receive the same number; numbers come from a board-wide lock.
- [ ] #13 Two writers on the same card are serialised by a per-card lock file.
- [ ] #14 A writer that finds a card's lock held waits 5 seconds and then fails with an error that names the card and the lock's holder (process and, where known, session or agent). (card: "waits a few seconds") [supplied: 5 seconds]
- [ ] #15 A lock whose holder's process no longer runs, or which is older than 30 seconds, is broken, and the next writer proceeds. (card: broken after a timeout) [supplied: the numbers]
- [ ] #16 A reader never sees a partly written card: a test that reads a card in a tight loop while another process rewrites it always parses a complete file, old or new.
- [ ] #17 The card file is the source of truth. A move writes the card first and appends its event log line after; after a crash between the two, the card stands and the log lacks that line. [lead's default]
- [ ] #18 A board has exactly eight columns, shown in this order: Draft, Backlog, Next, In Progress, Done, Released, Blocked, Blocked by Human.
- [ ] #19 Anyone (the human, an agent, the CLI, MCP or the web UI) can file a card into Draft and move a card out of Draft, and a card leaving Draft goes to Backlog only. Draft is never a route into any other column: a move from Draft to anywhere else is refused through every interface, the web UI included. (card, comment #8)
- [ ] #20 A card can be filled into Next only through the web UI. The same move attempted through an MCP tool or the CLI is refused, says why, and leaves the card where it was. A hook returning a card to Next (criterion 25) is a return, not a fill, and is allowed. [lead's default for the last sentence]
- [ ] #21 The web UI's address carries a token made fresh for each session, printed only to the human. A request without the token, such as one from an agent's Bash, is refused and changes nothing; the test drives a move into Next with and without the token. [lead's default]
- [ ] #22 The human orders Next in the web UI, and an agent asking for work is given the top card of Next first.
- [ ] #23 No MCP tool or CLI command sets a card's column directly except a move out of Draft into Backlog. Every other column change is made by the board's hooks, its gates or the human in the web UI. Ticking a checklist item never moves a column. [lead's default for the last sentence]
- [ ] #24 The human's moves in the web UI override the gates: the human can move any card to any column except out of Draft other than into Backlog (criterion 18). Every move that bypassed a gate writes an event log line naming which gate it bypassed (card gate or test gate). (card, comment #8)
- [ ] #25 Focus binding, as coder-fleet does today: each checkout has its own focus file naming one card; a worktree spawned from a focused checkout inherits its focus; a `Board-Item:` line in a spawn prompt also binds; a new, cleared or resumed session clears its checkout's focus and a compaction keeps it. Agents bound to a card move only that card, and a second checkout bound to a different card moves only its own. [lead's default]
- [ ] #26 An agent starting work on its bound card moves it to In Progress only from Backlog or Next. A start on a card in any other column moves nothing and the event log says why. [lead's default]
- [ ] #27 A `Blocker:` line in an agent's handoff, as the `handoff` skill defines it, adds an unticked Action for Human to its card carrying the blocker text, and adding any Action for Human moves the card to Blocked by Human (criterion 39). A `Propose item:` line never moves a column. [lead's default for the action]
- [ ] #28 A card leaving Blocked or Blocked by Human returns to the column it was blocked from, read from the event trail. It leaves Blocked by Human once every Action for Human on it is ticked. It leaves Blocked when the human moves it in the web UI, or when a later release run that names it passes. [lead's default for the first two sentences] [supplied: the third]
- [ ] #29 The table of which hook event moves a card from which column to which is written in the board's documentation, and a test drives each event and checks the resulting column.
- [ ] #30 Card gate: when a `coder` or `scripter` subagent bound to a card stops, or a task whose subject carries the `[board:<id>]` marker completes, and every acceptance criterion and Definition of Done item on that card is ticked, a hook moves the card to Done. A stop of any other agent never moves a card to Done. Apart from the human's web UI override (criterion 23), no route moves a card with an unticked item into Done, and a refused attempt names the unticked items. [lead's default]
- [ ] #31 The project's test command is set in the board's config under `~/.config/boards`, not in the repo.
- [ ] #32 A release names its cards in its annotated tag's message, on one line of the form `Cards: CF-1, CF-2`. A tag with no such line moves nothing. [lead's default]
- [ ] #33 A successful `git push` of a release tag made in a Claude Code session starts the test gate for the named cards, caught by a hook in that session. A tag push made outside any session is caught at the next session start in that repo, which asks the remote with `git ls-remote --tags` for tags it has not yet processed. A test pushes a tag from a shell, starts a session, and sees the gate start. [lead's default]
- [ ] #34 Every run of the test command the board makes is recorded in the board's event trail with the commit it tested and its result. Test gate: if a green run is recorded for the tagged commit, the named cards in Done move to Released at once. Otherwise the suite runs in the background against the tagged commit, checked out in a temporary worktree, and the cards move when it passes. [lead's default]
- [ ] #35 A background run's log is kept beside the board and survives the session that started it; it can be read through the CLI and the web UI while the run is in flight and after. A run whose process has gone without a result is started again at the next session start in that repo. [lead's default for the log] [supplied: the restart]
- [ ] #36 A failed run moves the named cards to Blocked, with the run's output added as a comment.
- [ ] #37 The push and the session's turn never wait for the suite: the turn that pushes the tag returns before the run finishes, measured against a test command that sleeps for longer than the turn takes.
- [ ] #38 A card named by a release but not in Done stays where it is, and the release's result says so. [supplied]
- [ ] #39 Released is the final column: only the human, in the web UI, can move a card out of it. [supplied]
- [ ] #40 Actions for Human are numbered items on a card. Adding one moves the card to Blocked by Human, and while any is unticked the card stays there and no move other than the human's web UI override takes it out. [lead's default for adding]
- [ ] #41 A card carries an acceptance criteria checklist and a Definition of Done checklist, each item tickable on its own. Every numbered checklist on a card - acceptance criteria, Definition of Done and Actions for Human - counts from 0, the same in the card file, the MCP tools, the CLI and the web UI, and the tools that tick or remove an item take that 0-based number: the human said "then Card checklists count from 0". (card)
- [ ] #42 The project-wide default criteria and Definition of Done live in the board config and are read live: changing a default changes what every open card shows, with no edit to the card files. (card) A tick on a default item is stored on the card by the item's text, so editing a default item's text shows it unticked on every card, and an added default item shows unticked. A card already in Done or Released is not moved by a change to the defaults. [lead's default for the tick storage] [supplied: the last sentence]
- [ ] #43 A card can be a sub-issue of another, with a dotted id, and can list cards it depends on.
- [ ] #44 A filter, available through MCP, the CLI and the web UI, returns exactly the cards whose dependencies are all in Done or Released. [supplied: Done counts]
- [ ] #45 Every column move, from any source, appends one line to the board's append-only event log, recording the time, the card, the from column, the to column, the source (hook, MCP, CLI or web UI), the session or agent where known, and the gate bypassed, if any.
- [ ] #46 Each card's frontmatter carries its last event and that event's source, and they match the log's last line for that card except after the crash criterion 16 describes.
- [ ] #47 Lines are never removed or rewritten; the log is kept forever.
- [ ] #48 The web UI shows each card's move history in its card detail, and no board-wide feed. [supplied]
- [ ] #49 The board builds with Bun into one compiled binary for each of darwin-arm64, darwin-x64, linux-x64 and linux-arm64, and that one binary serves both the MCP tools and the CLI. An installed plugin gets the binary for its machine through a session-start hook, as today. [lead's default for the architectures and the fetch]
- [ ] #50 Agents use the MCP tools only, served by the MCP server, for every card operation a session needs (file, read, list, filter, edit, tick, comment, add and tick Actions for Human, bind focus). The CLI offers the same operations for the human's own terminal. [lead's default] [supplied: the list of operations]
- [ ] #51 Once this board ships, the coder-fleet plugin carries none of the old board system: no old board binary, MCP server, CLI or board hooks, no `.boards/` directory, no `coder-fleet/state` branch, no state push, and no branch commits from the memory hook. (card, comments #5 and #8)
- [ ] #52 Agents keep `memory: project`. A session-start hook symlinks the repo's `.claude/agent-memory`, in the main checkout and in every linked worktree, to `~/.config/boards/<key>/memory`, so each agent's memory for a repo lives with its board and an agent reads and writes the same memory from any checkout. (card: the human's choice, comment after #8) The symlink never shows in `git status` (criterion 2). [supplied: the git status check] `/init` writes allow rules for Write and Edit under `~/.config/boards`, or `$XDG_CONFIG_HOME/boards` when that is set, so agents' memory and spec writes there do not prompt. [lead's default] Built only after criterion 0 passes.
- [ ] #53 Each spec lives under its repo's board directory in `~/.config/boards` as `specs/<issue>.md`, `spec-writer` writes specs there and nowhere else, and `enforce-agent-scope.sh` confines its writes to that directory. (card, comment #8) [lead's default: specs in the board's directory] [supplied: the file name and the scope hook]
- [ ] #54 Nothing in the repo still says the board, memory or specs live on the state branch or under `.boards/`: `docs/fleet-design.md` principle 1 and its "where the board lives" section are rewritten to name `~/.config/boards` as where the board, memory and specs live, with the accepted cost, the glossary's Board, Memory and Spec rows describe the new locations and eight columns, and AGENTS.md's sections on where work lives, releasing and the closing gate describe the new board. (card, comment #8)
- [ ] #55 The glossary's Milestone row goes, and the "epic" and "sprint" substitutions no longer point at a milestone. [lead's default]
- [ ] #56 The procedures that depend on the old board's behaviour are rewritten to the new columns and markers, not just renamed: `/drain`, `/triage`, `/work`, `/kickoff`, `lead-procedures` and AGENTS.md. Each says how it finds work (top of Next, then Backlog), how it parks a card (adding an Action for Human), how it binds a task to a card (the `[board:<id>]` subject marker), and how a release closes cards (the `Cards:` tag line). `check-all.sh` passes. [lead's default]
- [ ] #57 The OpenCode port gets a divergence-register row saying its board wiring still follows the old board; replacing it there is its own later card. [supplied]
- [ ] #58 Removing the old board drops every card under `.boards/`, with no import, and the new board starts empty: the human said "drop the existing cards, start the new board fresh". After group G lands, no card from `.boards/` exists anywhere on the new board, and its first card is group G's own work (see the paragraph under Acceptance criteria). (card)
- [ ] #59 The web UI listens only on a loopback address and is unreachable from another machine.
- [ ] #60 It starts on request through the CLI or an MCP tool, which prints its tokened address (criterion 20) to the human. A second session's request while one runs reuses the running server and its port rather than starting another. The server stops when the last session using it ends. [lead's default for the reuse] [supplied: start on request, the port reuse and the stop]
- [ ] #61 It does full editing: titles, descriptions, criteria and Definition of Done items, Actions for Human, comments and moves, under the column rules in group C.
- [ ] #62 Its look is the human's chosen design, the Ledger canvas "Kanban Board Refresh - Ledger" (https://claude.ai/artifact/V6YMifMqcQcg1ahzNFFCx5), built on shadcn/ui, with its laptop, desktop and ultrawide boards, card detail, dark mode, and empty, dragging and loading states.
- [ ] #63 The design is drawn with six columns. The built UI uses the same design extended to the board's eight columns, adding no structure the design lacks. [lead's default]
- [ ] #64 For each of the design's views and states, a screenshot of the running UI sits beside the design's own, and the human judges they match.
- [ ] #65 At session start in a repo with a board, the agent's context carries a reminder to check the board first, and the reminder is there again after compaction.
- [ ] #66 Before a session stops, the agent is reminded to reconcile the board, and this reminder also survives compaction. The reminder only adds context and never blocks a stop, so an unattended `/drain` under `/goal` stops normally. [lead's default for not blocking]
- [ ] #67 The default wording, which the human gave none for, is [lead's default]: at start, "This repo has a board. Before starting work, check it: take the top card in Next, or the card this checkout is bound to." Before stopping, "Before you stop, reconcile the board: tick what you finished, comment on what you didn't, and raise a `Blocker:` line for anything only the human can decide."
- [ ] #68 None of the non-goals above is built. Checked by a test that lists the MCP tools, the CLI commands and the card frontmatter fields and fails on any that carries a non-goal (milestones, documents, attachments, links, claim, submit or oracle states, import, export, backup), and by reading. [lead's default]
- [ ] #69 Nothing in the board's code, docs or this spec describes it as a migration path, and it has no import or export path. Checked by reading.
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

author: lead
created: 2026-11-13 10:45
---
The spec editor's pass is done. It raised 23 challenges, now in the spec's Challenges section, and three of them must be resolved before approval:
- C4: where a card may go when it leaves Draft.
- C6: whether the human's web UI moves bypass the card gate and test gate.
- C19: whether the whole state branch goes, or only the board's part of it. Agent memory and specs live there too.

Proposed by the spec editor, not filed: rewrite docs/fleet-design.md principle 1 ("Nothing that matters lives only in ~/.claude") and its section on where the board lives, to match a board kept in ~/.claude. This may need its own card. Filed only if the human says so.
---

author: lead
created: 2026-11-13 10:51
---
The human's answers to the three must-resolve challenges, 13 Nov 2026:
- C4: a card leaving Draft goes to Backlog only, and anyone may move it. Draft is no back door into any other column.
- C6: the human's moves in the web UI override the gates. The event trail records each move that bypassed a gate.
- C19: the whole state branch goes. Agent memory and specs move under ~/.claude with the board, and group G removes the branch and the memory hook's push. This reaches past the board, so docs/fleet-design.md principle 1 and the glossary's Memory and Spec rows change with it.
---

author: lead
created: 2026-11-13 10:53
---
The spec is ready for the human's edit pass. docs/specs/CF-207.md has 67 criteria in groups A to J, and every one of the spec editor's 23 challenges has a resolved line. Its status is revised, not approved. The remaining defaults are marked [lead's default] or [supplied].

One open question is left, for the human: what becomes of the cards already on this repo's board. It must be answered before group G removes .boards/.

The lead is checking against Claude Code's docs whether agent memory can live per repo under ~/.claude, as criterion 51 assumes.
---

author: lead
created: 2026-11-13 10:54
---
The human, 13 Nov 2026: "boards and board config should live in `~/.config/boards`". This replaces ~/.claude as the board's home.

My defaults, easy to reverse:
- The location is `$XDG_CONFIG_HOME/boards` when XDG_CONFIG_HOME is set, and `~/.config/boards` otherwise.
- Agent memory and specs, which move off the state branch, live in each board's directory there too.
- The sandbox denyWrite on ~/.claude no longer touches the board.
---

author: lead
created: 2026-11-13 10:56
---
Claude Code's docs (sub-agents, memory and permissions pages) show that subagent memory can't be pointed at an arbitrary directory. `memory:` takes user, project or local, each with a fixed path. Writes outside the working directories prompt by default.

The human's answer, 13 Nov 2026: a session-start hook symlinks the repo's .claude/agent-memory to ~/.config/boards/<key>/memory. That behaviour is undocumented, so the first build sub-issue must prove it works with `memory: project` before any other group depends on it.

My default: /init adds allow rules for Write and Edit under ~/.config/boards, so agents' spec and memory writes there don't prompt.
---

author: lead
created: 2026-11-13 10:58
---
The spec now puts the board under ~/.config/boards, or $XDG_CONFIG_HOME/boards when that is set. A new group 0, "Proof first", holds criterion 0, which comes ahead of everything else: a subagent with `memory: project` must read and write memory through the symlinked .claude/agent-memory, in the main checkout and in a linked worktree. Criterion 51 builds the symlink hook only after criterion 0 passes.

The spec is ready for the human's approval. Its status is revised. One open question remains: what becomes of the cards already on this repo's board.
---

author: lead
created: 2026-11-13 11:06
---
The human, 13 Nov 2026: "drop the existing cards, start the new board fresh". This answers the spec's open question 1. When group G removes the old board, every card in .boards/ is dropped, with no import. The new board starts empty. The human's words are the go-ahead for that deletion.

My default, easy to reverse: CF-207 and its sub-issues live on the old board and are dropped with it. So group G's own work is filed as the first card on the new board, and the build closes there. Every earlier sub-issue closes on the old board through its TaskCompleted gate before group G runs.
---

author: lead
created: 2026-11-13 11:12
---
The human, 13 Nov 2026: "then Card checklists count from 0". On the new board, acceptance criteria, Definition of Done and Actions for Human are numbered from 0 everywhere. This is folded into group E's checklist criterion.

This old board still numbers from 1, and it is not being changed. So when the spec's criteria 0 to 68 are filed on this card, the card shows them as #1 to #69, one higher than the spec.
---

author: lead
created: 2026-11-13 13:45
---
The spec is approved by the human (14 Nov 2026), and its 69 criteria are on this card. Card #1 to #69 are spec criteria 0 to 68, so each card number is one higher than the spec's. The last provisional criterion is removed.

The build splits into eleven sub-issues, one per spec group: 0, then A to F, H to J, with G last. Each sub-issue carries its group's criteria. Group 0 is built first. Group G, which removes the old board, is filed as the first card on the new board, per comment #13.

Definition of Done #4 (version bump and release) applies per sub-issue, as each lands.
---

author: lead
created: 2026-11-13 14:09
---
CF-207.1's proof failed: Claude Code makes symlinked agent memory read-only. The human's answer, 14 Nov 2026: "Just use agent memory as Claude Code wants it."

Agents keep `memory: project` in each checkout's .claude/agent-memory as real files, excluded from git as today. There is no symlink, no copy and no state branch for memory. Boards, board config and specs stay in ~/.config/boards. The accepted cost is that an agent working in its own worktree writes memory there, and those notes go when the worktree is removed.

The spec drops criterion 0 and rewrites criterion 51. CF-207.1 is archived, because the human's choice leaves nothing to prove. Its proof script stays on branch cf-207.1-memory-symlink-proof, and its run article is in docs/runs. CF-207.2 no longer depends on it.
---

author: lead
created: 2026-11-13 14:16
---
The human, 14 Nov 2026: docs/runs and specs "should also live under `.config/boards/` since everything else, other than memories, is out".

Specs were already in the board directory under criterion 1. Run articles now move there too, as a `runs/` directory beside `specs/`. The run-article skill, AGENTS.md's docs/runs lines and the lead procedures that save articles change with group G. Agent memory is the only fleet file left in a checkout.
---

author: lead
created: 2026-11-13 16:01
---
The human cut two of my defaults back to the simplest version, 14 Nov 2026, after asking where else the build had gone down an over-complicated path:
- No re-key. A repo with no remote keeps its path-keyed board forever, even after it gains a remote. Spec criterion 5 is rewritten. CF-207.2 removes the re-key before it merges. CF-207.3's lock criterion #7 is dropped.
- No web UI token. The UI trusts the local machine and listens on loopback only. Spec criterion 20 is now a record of the cut, and criterion 59 is reworded. CF-207.4's token criterion is dropped.

I made these spec edits directly rather than through another spec-writer round.
---

author: lead
created: 2026-11-13 22:08
---
For group G's card, when it is filed as the first card on the new board, from CF-207.9's review: give it a criterion, and a hooks.json contract case, that registers claude/coder-fleet/boards/src/hooks/session-start.ts on SessionStart. The registration must have no matcher that drops `compact`, and must run the hook from the compiled binary so an install without bun still gets the reminders. Spec criteria 48 to 57 don't name this registration today.
---

author: lead
created: 2026-11-13 22:19
---
/drain on 14 Nov 2026 took this parent's sub-issues through Next. Ready to merge: CF-207.3 (#194), CF-207.7 (#193) and CF-207.9 (#195). Released earlier: CF-207.2. Waiting on those merges: CF-207.4, .5, .6, .8 and .10. Group G is filed on the new board last. This card is not ready to merge until all of them are.
---

author: lead
created: 2026-11-14 02:08
---
For group G's card, from an automated security review of the v0.60.0 code: the no-board marker directory in claude/coder-fleet/boards/src/paths.ts is `$TMPDIR/coder-fleet-boards-<uid>`. Where TMPDIR is a shared /tmp, mostly on Linux, another user can create it first or plant it as a symlink. That can silence the once-per-session message, or make the hook create empty files elsewhere. On macOS, TMPDIR is per-user. Nothing reaches this until group G registers the hooks.

The requirement for G: keep the markers in a user-private directory, `$XDG_RUNTIME_DIR` when set, else `~/.cache/coder-fleet-boards`. Create it with mode 0700, and refuse a path that is a symlink or not owned by the current user.
---

author: lead
created: 2026-11-14 02:11
---
For group G, from CF-207.4's build: register src/hooks/pre-agent.ts on PreToolUse with the Agent matcher, plus subagent-start.ts and subagent-stop.ts, and check in a live session that PreToolUse sees tool_input.prompt before SubagentStart fires. Focus files and agent bindings also live under the per-user temp state root, so comment #21's user-private directory fix covers them too.
---

author: lead
created: 2026-11-14 02:32
---
Coordination with CF-209 (baseBranch and a push: base-only mode, filed by the coder-fleet-07 session at the human's request). For the groups that write criteria 53 and 55, so CF-209 doesn't rewrite them twice:
- State which branch is the trunk in one place in lead-procedures, not repeated.
- Don't make a pull request number the only way the new board can tell a card's work has landed. CF-209.4 adds a landing with no pull request.

For group D (CF-207.5): under base-only no tag is pushed, so spec 31 and 32's tag-driven move from Done to Released never fires. CF-209.4's landing path must make that move instead. Expect a merge in enforce-agent-scope.sh between criterion 52 and CF-209.2 and .3.
---

author: lead
created: 2026-11-14 03:01
---
The human, 14 Nov 2026, answering CF-211's Action for Human in the coder-fleet-07 session: "Allow one send-back". Spec criterion 65 now carries a narrow exception for CF-211's Stop hook alone: one send-back per stop, never twice, and never while a question, a Blocked or Blocked by Human card or a background task is open. The rest of 65 holds, CF-207.9's reminder included. CF-211 criterion 4 (a /drain under /goal still ends) tests that the exception didn't undo it.
---

author: lead
created: 2026-11-14 07:55
---
For group G (still to be filed, last), from CF-207.5's build: register four hook entry points. SubagentStop runs src/hooks/subagent-stop.ts, TaskCompleted runs src/hooks/task-completed.ts, PostToolUse on Bash runs src/hooks/post-push.ts, and SessionStart, for all sources, runs src/hooks/session-start.ts. The test gate's background runner is started as `import.meta.dir/test-runner.ts`. That breaks once the board is compiled into one binary, so G runs it from the binary, as a subcommand or a sibling file. G also needs CF-207.4's pre-agent and subagent-start hooks.
---

author: lead
created: 2026-11-14 11:03
---
For group G, from CF-207.8's build:
- The web UI's page, claude/coder-fleet/boards/web/, is a Vue and Vite build whose `dist/` isn't committed. G has to ship it built: embed `web/dist` in the compiled binary, or build it in CI or at release, so an install serves a working page. Until then `web` serves a page that says how to build it.
- The build's type-check uses vue-tsc under Node.
- startWebUI(cwd, holderPid, env) is what G's MCP tool calls, with the session as the holder.
---
<!-- COMMENTS:END -->
