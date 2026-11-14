---
name: help-boards
description: How the board works - where it lives (~/.config/boards, outside the repository), its cards and sub-issues, the meaning of the eight columns (draft, backlog, next, in progress, done, released, blocked, blocked by human), which columns hooks and gates write and which an agent never does, the checkout's focus (`card_focus`, `/work`) and the `Board-Item:` line that bind a spawn to its card, the `[board:<id>]` task marker and the release tag's `Cards:` line, how a handoff's Blocker lines become Actions for Human, and what earns a card at all.
when_to_use: Read before filing, reading, moving, commenting on or closing any board card, before spawning a subagent against a card, before reporting board status to the human, and whenever you are deciding whether a piece of work is board work or just a task inside the session.
---

# The board

The board is this repository's, and it lives outside it: one directory under `~/.config/boards/` (`$XDG_CONFIG_HOME/boards/` when that is set), named by the board's id prefix, so `~/.config/boards/BD/` holds the cards `BD-1`, `BD-2` and on. The main checkout and every worktree of the repository reach the same board, found by the repository's origin URL, or its git directory's path when it has no origin. The directory holds one markdown file per card under `cards/`, the board's `config.yml`, its append-only event trail, the specs in `specs/` and the run articles in `runs/`. Nothing of the board's is ever in the repository, nothing commits it, and it exists on this machine only: another clone or a web session sees none of it. Agent memory is not there: it stays in each checkout's `.claude/agent-memory`.

It is read and written through the boards MCP tools (`card_read`, `card_list`, `card_next`, `card_file`, `card_comment`, `card_add`, `card_tick` and the rest), the `boards` CLI in the human's terminal, and the web UI, and never by editing a card file by hand. The tools, the hook events and the gates are documented in the plugin's `boards/README.md`.

**Projects** - a project is the repository; there is one board per repository.

**Issues** - one card per tracked unit of work, and a sub-issue is a card with a dotted id under its parent, `BD-12.1` under `BD-12`. A card can list cards it depends on, and `card_list` with `ready: true` gives the cards whose dependencies are all in Done or Released.

## What earns a card

An issue in the glossary sense earns a card. That is the unit of work the human cares about, and it either has a spec or is trivial enough not to need one. A sub-issue earns a card too and stays under its parent.

A Task in the glossary sense never appears on the board. Tasks are the execution layer inside a session, cheap and many, created with `TaskCreate` and dead when the session ends. One issue may spawn twenty of them and the board does not move. Sessions, phases, rounds, handoffs and reviews are not cards either. If you are filing something to remember it for the next ten minutes, it is a task, not a card.

The lead files work that surfaces mid-run. An agent that spots adjacent work while doing a task does not file it itself: the work leaves the run as a `Propose item:` line under Decisions needed, and the lead files it when it merges the handoffs. A Low review finding never earns a card: it is fixed in a fix round that runs anyway or dropped.

`fleet-steward` is the named exception, and the only one. Its sweep is scheduled and unattended rather than mid-run, and there is no lead in the loop to file for it, so proposing would mean a weekly run produced nothing at all until the human next started a session. It files what the sweep found itself, as cards on the coder-fleet repository's board, with their acceptance criteria. That is a licence to file cards and comment on them and nothing else: it never edits, ticks or moves a card that already exists.

## The eight columns

| Column | Means | Written by |
|---|---|---|
| Draft | Filed, not yet accepted as work | Anyone filing a card: every card starts here |
| Backlog | Accepted, not started | Anyone moving a card out of Draft, with `card_to_backlog`; a card leaves Draft for Backlog only |
| Next | The human's ordered queue, top first. A card here is the human's order to build it | The human only, in the web UI. A hook may return a card here that was blocked from it |
| In Progress | An agent has picked it up | The hooks, when an agent is spawned on a card in Backlog or Next |
| Done | Every acceptance criterion and Definition of Done item is ticked | The card gate, on the stop of the `coder` or `scripter` bound to it or a `[board:<id>]` task's completion |
| Released | A release named it and the project's suite passed on that commit | The test gate, on a pushed release tag. Final: only the human moves a card out |
| Blocked | Waiting on something that is not the human, such as a release whose suite failed | The test gate, on a failed release run |
| Blocked by Human | Waiting on the human: a card with an unticked Action for Human. The human queue | Adding an Action for Human, as a `Blocker:` line does |

`card_next` gives the card to take next: the top of Next, else the first card in Backlog, skipping any card waiting on the human. `/coder-fleet:drain` finishes the In Progress cards the human ordered first, then takes cards from `card_next`; a Backlog card is built only once the human has ordered it.

Blocked and Blocked by Human are separate columns because they need different responses. Blocked is something to wait out or work around. Blocked by Human costs the human an interruption, and it is the only column they monitor. A card leaving either goes back to the column it was blocked from, read from the event trail.

## Who writes the columns

**In the fleet, columns are written by hooks and gates and never by an agent.** The one move a tool makes is `card_to_backlog`, out of Draft, and the one other column change an agent causes is adding an Action for Human, which parks the card in Blocked by Human. So do not try to move a card, do not ask for one to be moved - the lead suggesting a card for Next to the human is the one exception - and do not report that you moved one. Filling Next is refused through every tool; only the human does it, in the web UI, where the human can also move any card past a gate, and the trail records which gate the move bypassed.

**Ticks never move a column.** Only the lead ticks an acceptance criterion or a Definition of Done item, with `card_tick`, and only on evidence - for a criterion, that it is proven on the branch - naming the evidence, such as the test, in a comment. A Definition of Done item that does not apply is ticked, with `not applicable: <reason>` in a comment. Every list on a card counts from 0. A card shows its own items first, then the board's project-wide defaults from its `config.yml`, which are read live: a changed default changes every open card. No subagent, hook or handoff line ticks.

## Telling the hooks which card

Hooks move the columns, and they move only the card an agent is bound to.

**A spawn binds when it is sent.** When the lead sends a spawn, the hook binds it to the card its `Board-Item: <id>` line names, else to the checkout's focus at that moment, and starts work on that card, which moves it from Backlog or Next to In Progress. The focus is one card per checkout, kept in the board's private state directory, set with `card_focus` or the human's `/work`:

```
card_focus BD-12
```

Focus the card, or give the spawn its `Board-Item:` line, before the first spawn on it. Every new, cleared or resumed session starts unfocused, because the SessionStart hook clears the focus an earlier session left; a compaction keeps it. A resumed agent stays on the card it first started on. A focus naming a card in Done or Released binds nothing. An unfocused checkout binds a spawn with no `Board-Item:` line to nothing and moves nothing - which is correct, because most spawns are not board work. Clear the focus with `card_focus` and no id before work that is not the card's.

**Which spawns carry the line.** Any spawn doing board-tracked work: a `coder` on a card or sub-issue, a `reviewer` on that diff, a `spec-writer` building the brief or the spec for a filed card, a `ui-designer`, `tech-writer` or `researcher` commissioned against one. The test is whether the result belongs on a card. A `scout` sent to find where something lives, or any agent spawned to answer a question inside the conversation, is not board work and gets no line. One line per spawn, the label then the card's id and nothing after it:

```
Board-Item: BD-12
```

If you are the agent receiving the line, use it to read the card you are working against with `card_read`; never treat it as permission to move a column.

**Done is the card gate.** A card moves to Done only when every acceptance criterion and Definition of Done item on it is ticked, the board's defaults included, and only on one of two triggers: the stop of the `coder` or `scripter` bound to it, or the completion of a task whose subject carries the `[board:<id>]` marker. That marker goes on the one task that represents closing the card; an ordinary execution task carries none. A card the gate holds stays where it is, and the trail names the unticked items.

**Released is the test gate.** A release names its cards on one line of its annotated tag's message, `Cards: BD-12, BD-14`. When the tag is pushed in a session, or a later session start finds it on origin, the board runs the project's test command, the `test:` line in the board's `config.yml`, on the tagged commit in the background, and moves each named card in Done to Released on a pass, or to Blocked with the run's output on a failure. The push and the turn never wait for it. A tag with no `Cards:` line moves nothing.

**The route to Done needs the task tools.** Claude Code offers `TaskCreate` and `TaskUpdate` only to a fixed list of older models unless `CLAUDE_CODE_ENABLE_TODO_TOOLS` is set, and the lead runs on a newer one, so the fleet sets it in the project settings `/init` writes, and `/kickoff` checks it. Without them a `[board:<id>]` task cannot be completed, and a card no builder's stop closed waits for the human to move it in the web UI.

## Decisions needed and the human queue

Every handoff ends with a Decisions needed heading carrying typed lines, and only one type touches the board.

`Blocker:` adds an unticked Action for Human to the bound card carrying the blocker text, and adding it moves the card into Blocked by Human, so the queue answers what is blocked and on what without anyone opening a transcript. `Propose item:` never moves a column: the lead searches the board and files it only when the human says so - or `fleet-steward` files its own sweep's findings, per What earns a card above.

**Actions for Human.** A numbered list on the card, counted from 0. The lead adds one with `card_add` (list `actions`) when it needs the human's decision outside a subagent handoff, which parks the card in Blocked by Human, and asks in the session as well. Write each as a question ending in `?`. When the human answers one, the lead ticks it with `card_tick` and comments the answer with `card_comment`; the human can tick it in the web UI. While any action is unticked the card stays in Blocked by Human, and once every one is ticked the board's next hook takes it back to the column it was blocked from. There is no removing an action: one that is void is ticked with a comment saying why.

A false blocker is not free. Park a routine suggestion in the queue and you have interrupted the human for nothing; miss a real one and they never learn they were needed.

## Card conventions

Title the card as the change, in the imperative, in the glossary's words - "Rotate refresh tokens on reuse", not "refresh token stuff". One card, one outcome. If a card needs two answers to close, it is two cards or a parent with sub-issues.

Name the spec, `specs/<issue>.md` in the board's directory, on the card rather than pasting it in, because a copy goes stale silently. Its acceptance criteria are the exception and go on the card, because the card is what a coder builds from and what the human reads. Where the card and the spec disagree on wording, the spec wins.

Add comments, do not rewrite descriptions. The comments and the event trail are how a blocked card is understood a week later; `boards history <id>` in the human's terminal prints a card's moves and their sources. The lead's comments at each sub-issue start, when its pull request is ready to merge, and at each merge are the progress record.

## When the tools are missing

If `card_read`, `card_focus` and the rest are not among your tools, the boards MCP server did not load in this session, and the plugin being enabled does not rule that out. Say so before doing anything else, and say why, checking in this order: the server is switched off for this project (`~/.claude.json` holds `disabledMcpServers` under `projects["<this project path>"]`; if it lists `plugin:coder-fleet:boards`, the `/mcp` toggle turned it off, and `/mcp` turns it back on for the next session); the plugin is not enabled here (`claude plugin list` from the project shows no enabled `coder-fleet@rzem`); the repository has no board (`boards.sh where` in the plugin's `boards/` directory says so, and the human makes one with `boards.sh init`). A spawn still binds through its `Board-Item:` line without the tools. An agent that could not reach the board says so in its handoff, as an Unverified line naming the cause, so the lead sees it and the human can fix it for the sessions that follow. Never fall back silently, and never edit a card file by hand.

**The web UI is optional.** `/board` starts it, or reuses the one running, through `board_web`, on a loopback address only. It is where the human fills and orders Next.
