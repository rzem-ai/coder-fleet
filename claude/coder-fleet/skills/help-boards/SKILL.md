---
name: help-boards
description: How the board works - where it lives (~/.config/boards, outside the repository), cards and sub-issues, the eight columns and who writes each, how the focus and the `Board-Item:` line bind a spawn to its card, the card gate and the test gate, how a `Blocker:` line becomes an Action for Human, and what earns a card at all.
when_to_use: Read before filing, reading, moving, commenting on or closing any board card, before spawning a subagent against a card, before reporting board status to the human, and whenever you are deciding whether a piece of work is board work or just a task inside the session.
---

# The board

The board is this repository's, and it lives outside it: one directory under `~/.config/boards/` (`$XDG_CONFIG_HOME/boards/` when that is set), named by its id prefix (`BD/` holds `BD-1` and on), and every checkout and worktree of the repository reaches it. It holds a markdown file per card under `cards/`, its `config.yml`, its event trail, the specs in `specs/` and the progress logs in `runs/`, on this machine only and never committed. Agent memory is not there: it stays in each checkout's `.claude/agent-memory`.

It is read and written through the boards MCP tools, the `boards` CLI in the human's terminal and the web UI, never by editing a card file by hand. A project is the repository, with one board. A sub-issue is a card with a dotted id under its parent, `BD-12.1` under `BD-12`. Where a card and its spec disagree on wording, the spec wins. Add comments rather than rewriting a description, because the comments and the trail are a card's history.

## What earns a card

An issue or sub-issue in the glossary sense earns a card. A Task never does, and nor do sessions, phases, rounds, handoffs or reviews: something filed to remember for the next ten minutes is a task.

An agent that spots adjacent work does not file it: it leaves the run as a `Propose item:` line, and the lead handles it. A Low review finding never earns a card.

## The eight columns

| Column | Means | Written by |
|---|---|---|
| Draft | Filed, not yet accepted as work | Anyone filing a card: every card starts here |
| Backlog | Accepted, not started | `card_to_backlog`, out of Draft only, or the last Action for Human tick |
| Next | The human's ordered queue, top first. A card here is the human's order to build it | The human only, in the web UI; a hook or the last Action for Human tick may return a card here |
| In Progress | An agent has picked it up | The hooks, on a spawn bound to a card in Backlog or Next, or the last Action for Human tick |
| Done | Every acceptance criterion and Definition of Done item is ticked | The card gate |
| Released | A release named it and the project's suite passed on that commit | The test gate. Final: only the human moves a card out |
| Blocked | Waiting on something that is not the human, such as a release whose suite failed | The test gate, on a failed release run |
| Blocked by Human | Waiting on the human: a card with an unticked Action for Human. The human queue | Adding an Action for Human, as a `Blocker:` line does |

Blocked is something to wait out or work around; Blocked by Human costs the human an interruption, and it is the only column they monitor. A card leaving either goes back to the column it was blocked from, read from the trail.

## Who writes the columns

**Columns are written by hooks and gates, never by an agent.** The one move a tool makes is `card_to_backlog`, and the one other column change an agent causes is adding an Action for Human. So do not move a card, do not ask for one to be moved - the lead suggesting a card for Next to the human is the one exception - and do not report that you moved one. In the web UI the human can also move any card past a gate.

**Ticks never move a column.** Only the lead ticks an acceptance criterion or a Definition of Done item, with `card_tick`; no subagent, hook or handoff line ticks. Every list on a card counts from 0, and a card shows its own items first, then the board's defaults from `config.yml`, read live.

## Telling the hooks which card

Hooks move only the card an agent is bound to. A spawn binds when it is sent, to the card its `Board-Item: <id>` line names, else to the checkout's focus at that moment, and the hook starts work on that card. The focus is one card per checkout, set with `card_focus <id>` or the human's `/work`, and cleared with `card_focus` and no id. Every new, cleared or resumed session starts unfocused; a compaction keeps the focus. A resumed agent stays on the card it first started on, and a focus on a card in Done or Released, or none at all, binds a spawn with no `Board-Item:` line to nothing, which is right for most spawns.

A spawn doing board-tracked work carries the line: a `coder` on a card or sub-issue, a `reviewer` on that diff, a `spec-writer` on a filed card, a `ui-designer`, `tech-writer` or `researcher` commissioned against one. A `scout`, or any agent answering a question inside the conversation, gets none. One line, the label then the id and nothing after it: `Board-Item: BD-12`. If you are the agent receiving it, read the card with `card_read`; it is never permission to move a column.

**Done is the card gate.** A card moves to Done only when every acceptance criterion and Definition of Done item on it is ticked, the board's defaults included, on one of two triggers: the stop of the `coder` or `scripter` bound to it, or the completion of a task whose subject carries the `[board:<id>]` marker, which goes on the one task that represents closing the card. A card the gate holds stays put, and the trail names the unticked items.

**Released is the test gate.** A release names its cards on one line of its annotated tag's message, `Cards: BD-12, BD-14`. When the tag is pushed, or a later session start finds it on origin, the board runs the `test:` command from `config.yml` on the tagged commit in the background, and moves each named card in Done to Released on a pass, or to Blocked with the output on a failure. A tag with no `Cards:` line moves nothing.

**The route to Done needs the task tools.** Claude Code offers `TaskCreate` and `TaskUpdate` to newer models only when `CLAUDE_CODE_ENABLE_TODO_TOOLS` is set, which `/init` does in the project settings and `/kickoff` checks. Without them a `[board:<id>]` task cannot complete, and a card no builder's stop closed waits for the human.

## Decisions needed and the human queue

Of a handoff's typed lines, only `Blocker:` touches the board: it adds an unticked Action for Human to the bound card carrying the blocker text, which moves the card into Blocked by Human. `Propose item:` never moves a column. A false blocker interrupts the human for nothing; a missed one means they never learn they were needed.

**Actions for Human** are a numbered list on the card, counted from 0, each a question ending in `?`. The lead or the human ticks one when it is answered. While any is unticked the card stays in Blocked by Human; the tick that leaves none returns it, in the same call, to the column it was blocked from, or Backlog. A card still parked with every action ticked goes back at the next session start, unless the human dragged it there. An action is never removed: a void one is ticked with a comment saying why.

## When the tools are missing

If `card_read`, `card_focus` and the rest are not among your tools, the boards MCP server did not load. Say so first, with the cause, checking in order: the server is switched off for this project (`~/.claude.json` lists `plugin:coder-fleet:boards` in `disabledMcpServers` under `projects["<this project path>"]`, and `/mcp` turns it back on for the next session); the plugin is not enabled here (`claude plugin list`); the repository has no board (`boards.sh where` in the plugin's `scripts/` says so, and `boards.sh init` makes one). A spawn still binds through its `Board-Item:` line. A subagent that could not reach the board names the cause in an Unverified line. Never fall back silently or edit a card file by hand.

The web UI is optional: `/board` starts it, or reuses the one running, on a loopback address.
