---
id: CF-210
title: >-
  A command prints a ready /goal line for a card, and the lead says each turn
  what the goal's judge needs to see
status: Next
assignee: []
created_date: '2026-11-14 02:59'
updated_date: '2026-11-14 12:57'
labels: []
dependencies: []
type: feature
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Asked by the human in the session on 2026-11-14: "now I see that there is a "goal" command in claude code, how do we hook into tha to make sure the agents stay on target". Offered three ways to work with it, he picked "Goal lines + Stop hook": this card is the goal lines, and the Stop hook is its own card filed beside it.

What `/goal` is, from the Claude Code docs read on 2026-11-14 (code.claude.com/docs/en/goal.md and hooks.md). It is a built-in shortcut for a session-scoped prompt-based `Stop` hook. `/goal <condition>` sets a condition of up to 4,000 characters and starts a turn; after every turn the small fast model is sent the condition and the conversation so far and answers met, not yet met or impossible, with a short reason; not yet met starts another turn with the reason as guidance. The judge calls no tool and reads no file: it sees only what the lead has put in the conversation. The check is skipped while a subagent or background shell is running. The loop stops by itself after several turns in a row with no tool use. There is no built-in turn cap; the docs' advice is a clause in the condition such as "or stop after 20 turns". It works headless as `claude -p "/goal ..."`. A goal survives `--continue` and `--resume` and is removed by `/clear`.

What a plugin cannot do, per the same docs: set, read or clear a goal from a command, a skill, a hook or settings; see it in hook input; or react to it being met. So the fleet's part is the condition's text and what the lead says for the judge to read. The human pastes the line.

What exists today. `claude/coder-fleet/commands/drain.md:25-31` ships one goal line, for draining In Progress and Next, whose condition is that the transcript's last "Next drained:" line accounts for every card. Nothing gives a goal line for one card, and nothing makes the lead state a card's standing in a fixed form outside `/drain`.

Subagents are out of this card's reach and stay so: a goal runs at the main session's stop only, and a coder never sees it. They are kept to the card by the brief, the handoff gate and the review rounds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fleet command, given a card id, prints one `/goal` line the human can paste unchanged, whose condition is built from that card: it is met only when the lead's latest status line for the card shows every acceptance criterion ticked and the card at the last shipping step the project grants, or shows the card waiting on the human.
- [ ] #2 The printed condition always carries a stop clause the judge can read from the conversation - a turn budget, and "or the lead has put a question to the human" - so a goal never holds the session open on a card that is waiting on an answer; the turn budget has a stated default and an argument to change it.
- [ ] #3 The lead ends each turn on a focused card with one status line in an exact, documented form naming the card, criteria ticked out of total, the review's standing, the gates' result and what it is waiting on, defined once in `lead-procedures`; the printed goal condition refers to that line by its form.
- [ ] #4 The status line is only ever written from the card's real state read that turn, never from memory of an earlier turn, and `lead-procedures` says so, because the judge believes what the transcript says.
- [ ] #5 `/drain`'s existing goal line still works unchanged, and the new command and `/drain` describe `/goal` in one shared place rather than twice.
- [ ] #6 The printed line is under the 4,000-character limit for a card with the longest criteria list on the board, and the command says so instead of printing a line that would be cut.
- [ ] #7 The command's text states what the goal cannot do - it does not reach subagents, and it judges only what the lead said - so the human is not told it keeps a coder on the card.
- [ ] #8 The `migration-checklist` passes over the skill and agent text this changes, and `check-all.sh` is green.
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
created: 2026-11-14 12:57
---
Moved to the new board as CF-3, by the human's order on 14 Nov 2026, with its criteria copied across. Builds still bind here until group G switches the hooks over.
---
<!-- COMMENTS:END -->
