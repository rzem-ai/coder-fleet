---
description: Ask the human every open question on the board with AskUserQuestion - each unticked Actions for Human entry on any card short of Done - and record each answer on its card, moving no column and starting no build
---

Ask the human every question the board is waiting on, as a prompt to pick from and never as a list to read. A question lands in a card's Actions for Human when a subagent's `Blocker:` line adds it, when the lead adds one with `card_add`, or when a `drain` parks a card on it, and until it is answered the card waits in Blocked by Human. `triage` asks the ones on cards In Progress, Blocked and Blocked by Human while it closes finished cards; this command asks them all, and does nothing else. It starts no build and writes no column.

## Procedure

1. List the cards in every column but Done and Released with `card_list`, once per column, Draft included, and read each with `card_read`. Collect each unticked Action for Human, with the card's id and the action's number, counted from 0. If the board tools are not available, say the boards MCP server is not loaded and why, as `work` does, and stop. With nothing unticked anywhere, say so and stop.
2. Add what is waiting and not yet on a card. A decision the session is waiting on from the human that no card records - one a review left for the human, or one you raised in a reply - is added to its card with `card_add` (list `actions`), phrased as a question ending in `?`, so it is asked with the rest and the card keeps the record; adding it parks the card in Blocked by Human.
3. Order the questions: cards in Blocked by Human first, then In Progress, Blocked, Next, Backlog and Draft, and a card's entries by number. Skip an entry for which a comment on the card records a leave it answer naming that entry, unless the card changed since that comment.
4. Ask them with AskUserQuestion, at most four questions per prompt, in as many prompts as it takes. Each question names its card's id and stands on its own, because the human may see only the prompt: say in a sentence what the card is and what is waiting on the answer. Give two to four options built from the card's comments, the recommended one first and marked `(Recommended)`, and where leaving it is a real choice, an option to leave it.
5. Record each answer on its card straight away, before the next prompt. An answered entry is ticked with `card_tick` (list `actions`), with a `card_comment` that names the entry's number and quotes the human's answer. A leave it answer is a decision: record it as a comment naming the entry's number, with the entry left unticked, so the next run does not ask it again. A question the human skipped goes unrecorded. Never move a card's column and never start a build on an answer: once every entry is ticked, the board's next hook takes the card back to the column it was blocked from, or the human moves it, and building is the human's order or `drain`'s.
6. End with one line, exactly in this shape, writing an empty group as `0 left (-)` and so on, each id being a card's id and the entry's number, such as `CF-12#0`:

   `Ask: <n> asked (<ids>), <n> answered (<ids>), <n> left (<ids>), <n> skipped (<ids>).`
