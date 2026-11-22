---
name: help-boards
description: The OpenCode board, its eight columns, card bindings, human queue, ticks and release gates. Read before any board work.
---

# The board

Re-expressed from `claude/coder-fleet/skills/help-boards/SKILL.md`. One repository, one board under `~/.config/boards/<PREFIX>/`, or `$XDG_CONFIG_HOME/boards/<PREFIX>/`. Repository origin or git-directory identity lets its worktrees share that board. Claude and OpenCode use the same card format and board. Cards and specs stay outside git; memory belongs to the harness.

Use the boards MCP tools, whose OpenCode identifiers are `boards_card_read`, `boards_card_list`, `boards_card_next`, `boards_card_file`, `boards_card_comment`, `boards_card_add`, `boards_card_tick` and the other tools in that server's live catalogue. Never edit card files by hand. `/board` starts the web UI, where the human fills and orders Next. A missing server or binary is reported, never silently replaced with guessed file writes.

## Columns and gates

| Column | Meaning | Writer |
|---|---|---|
| Draft | Filed, not yet accepted | Every filed card starts here |
| Backlog | Accepted, not started | card_to_backlog, from Draft |
| Next | The human's ordered build queue | The human in the web UI only |
| In Progress | An agent has started on its bound card | The native lifecycle adapter |
| Done | Every criterion and Definition of Done item ticked | The card gate |
| Released | A pushed annotated tag named it and its suite passed | The release test gate |
| Blocked | A non-human dependency, including a failed release suite | The release gate |
| Blocked by Human | An unticked Action for Human | Adding an action, including a validated Blocker |

Only the lead ticks criteria or Definition of Done items, using named evidence in a comment. Lists are numbered from zero, including live board defaults. Ticks are not a column write. After ticking, the lead calls fleet_control complete with the card id to run the gate; a conforming builder stop runs it too. OpenCode has no Claude TaskCompleted event; no native todo is claimed to trigger this gate.

An annotated release tag names its cards on `Cards: BD-12, BD-14`. After a successful shell push, or at a later main-session start, the board checks the remote and runs its configured test command on the tagged commit in the background. Neither the push nor the turn waits for it. No Cards line means no card moves.

## Binding and the human queue

Give every tracked spawn a line `Board-Item: BD-12`. The child binds at its first model context, using that line or the checkout's focus. Its OpenCode session id is the durable binding key; a resume keeps the original card even when focus changes. A card in Done or Released binds nothing. Concurrent root sessions share checkout focus, so the explicit line is required for tracked work. Focus is not permission to build.

The runtime validates the final handoff before reading blockers or running the gate, and requests at most three corrections. The native parent report may arrive before the correction: the lead must reject a malformed result rather than treating the report as approval. Missing binary means validation is inactive and the prompt says so.

A valid Blocker adds one unticked Action for Human and parks the bound card. A Propose item never moves a column; the lead searches existing work and files only on the human's go-ahead. When the human answers, the lead comments the answer and ticks the action. The last tick returns the card to its previous column or Backlog. A finding, including a failed test, is never a blocker unless only a human decision can unblock it.

## What earns a card

One human-visible outcome earns one card, with sub-issues as dotted child ids. Execution tasks, sessions, phases, reviews and handoffs are not cards. Low findings are fixed during an already-running fix round or dropped.
