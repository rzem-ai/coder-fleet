---
description: Finish the cards already In Progress, then work the Next column top first, card after card, without stopping to ask the human - each card built to a pull request ready to merge, or parked with its question on the card - and end with one line saying what drained. Run it under /goal to keep it going unattended
argument-hint: [max cards]
---

Work the In Progress column first and the Next column after it, for as long as they hold a card you can take, without stopping for the human. Every card in Next is already the human's order, and an In Progress card is worked only when the human ordered it built (step 2), so nothing here needs a go. Your delegation policy holds in full - the challenge gate, the evaluator's contract and verify passes, the review, the round cap, the card comments and the focus - with two changes for this run only, because nobody is watching it:

- A question goes on the card, never to the human. Where the policy would ask with AskUserQuestion, add the question with `task_edit` `actionsAdd`, comment that this drain parked the card on it, and go to the next card. A `Blocker:` line from a subagent parks its card the same way, and the `SubagentStop` hook has already moved it.
- A card leaves your hands at ready to merge. Open its pull request, leave the `ready to merge in PR #<n>` comment the policy gives, and merge nothing: the merge is the human's gate, and the next card is built without it.

The arguments were `$ARGUMENTS`. A number caps how many cards this run takes, across both columns; nothing means no cap. A card in Blocked by human is in neither column and stays as it is.

## Procedure

1. List In Progress and then Next with `task_list`, each top first by ordinal, and record the ids. That list is this run, In Progress cards first: a card the human adds to Next, or that moves into In Progress, while it runs waits for the next run, and nothing outside the list is built.
2. Take the cards in order. Skip a card, with the reason recorded for the report, when it already has an unticked action in Actions for Human, or when its work depends on an earlier card's pull request that has not merged. Skip an In Progress card, with the reason `not ordered`, unless the human ordered it built: it carries a lead `Sub-issue <n> of <m>: started` comment or the human's recorded order, because any agent's start, a researcher's or a spec-writer's, moves a card to In Progress. Skip one, with the reason `held`, when something still holds it, so two builders never share a branch: a spawn on it is still running, or its worktree under `.claude/worktrees/` is locked by a live process. Find the worktree with `git worktree list --porcelain`, on a branch whose name starts with the card's id lower-cased and a `-`, so `cf-18-` never matches `cf-184-`; a parent card's sub-issues have their own branches, `cf-183.1-` and so on, and the parent's check covers theirs too. The harness's lock reason carries a pid, and `kill -0 <pid>` says whether it is live, as `prune-worktrees` reads it. A lock whose process is gone does not hold the card, and you never unlock it.
3. Build each card you take as your policy says, with the two changes above, until it is ready to merge or parked. Resume on progress, not on the column: a card in either column whose comments carry `Sub-issue <n> of <m>:` progress, or that has branches, worktrees or an open pull request, is picked up from where those say it stands, in the worktree it already has rather than a new one, and never rebuilt; a Next card with no progress starts fresh. A `ready to merge in PR #<n>` comment marks one sub-issue. Read the latest comment's `Done still needs:` part and the sub-issue cards: the card counts as ready to merge only when every sub-issue is ready to merge or merged and the card names each PR; otherwise build the next sub-issue not yet built, and judge done against the card's criteria, never by how many sub-issues have merged. Then clear the focus before the next card, so nothing of this card binds the next one's spawns.
4. Stop when the list is worked through, when the cap is reached, or when a failure is not the card's own - the board server gone, the gates red on the default branch, every spawn returning without a handoff - and say which.
5. End with one line, exactly in this shape, writing an empty group as `0 parked (-)` and so on:

   `In Progress drained: <n> ready to merge (<ids>), <n> parked (<ids>), <n> skipped (<ids>), <n> not reached (<ids>). Next drained: <n> ready to merge (<ids>), <n> parked (<ids>), <n> skipped (<ids>), <n> not reached (<ids>).`

## Running it unattended

One pass can end before the list does, when the context fills or a turn ends early. `/goal` keeps it going: after every turn a small model checks a condition against the transcript and starts another turn until it holds. In a session whose agent is the lead, as the project settings make it, switch to auto mode so tool calls do not wait on a prompt, then set:

```text
/goal Use the coder-fleet:drain skill to work the In Progress column and then the Next column. Done when the transcript's last "Next drained:" line, which follows an "In Progress drained:" segment, accounts for every card the drain listed at its start in each column, each one ready to merge with its pull request named on the card, parked with an open question on the card, or skipped with a reason, and no card outside that list was built. Or stop after 150 turns.
```

The same works headless, `claude -p "/goal ..."` with `--output-format stream-json --verbose` to see it run. The goal waits while a subagent or background command is still running, so a long build does not end it early. What comes back for the human in the morning is the drained line, the pull requests to merge and the Blocked by human column.
