---
description: Review what merged to the default branch since the last sweep for drift - one helper written twice, one pattern done two ways, dead code, a convention held by habit and no check - and file each finding as a To do card that proposes the check that stops it coming back
argument-hint: [since, e.g. "14 days ago" or a commit]
---

Sweep the default branch for drift. Every change was reviewed on its own, and none of those reviews could see the codebase sliding across a dozen of them: the same helper written in two places, a pattern done one way in March and another way in May, code nothing calls any more, a convention in `AGENTS.md` that holds only because every agent so far happened to follow it. This command reviews the accumulated range instead of one change, and files what it finds. Running it is the human's say-so to file those findings as To do cards; it never builds them, and never puts one in Next.

The arguments were `$ARGUMENTS`: how far back to sweep, as a date git understands (`14 days ago`) or a commit. Nothing means seven days.

## Procedure

1. Find the range. The default branch is what `origin/HEAD` points at, or `main` with no remote, and its head is the end. The start is the commit given, or else `git rev-list -1 --before="<since>" <default>`, or the root commit when the history is younger than that. If the start is the head, there is nothing to sweep: say so and stop.
2. Cut a detached worktree of the head under `.claude/worktrees/sweep-<short sha>` with `git worktree add --detach`, so the reviewer runs the declared gates in a linked worktree as it always does.
3. Clear the checkout's focus with `task_focus` `{clear: true}`, because a sweep belongs to no card and a focused spawn would move one. Then spawn `reviewer` plainly, type and prompt only, with a sweep brief: the range, the worktree, `AGENTS.md`'s Conventions section and `docs/limits.md` if the project has one as the stated intent, and drift as the one dimension. Each finding is a `Propose item:` line naming the files and lines, what drifted and the check that would fail on it next time - a lint rule, a structural test, a gate - because a cleanup without a check is the same finding in the next sweep.
4. Merge the handoff as your policy says for `Propose item:` lines, with one change: an unmatched line is filed now with `task_create` in To do, never Next, its acceptance criteria being the drift removed and the check added that fails on it. A matched line becomes a comment on the card it matched.
5. Remove the sweep worktree with `/coder-fleet:prune-worktrees`, which removes it once it is clean and an ancestor of the default branch, as a detached head of it always is.
6. Report the range, the gates' results, the cards filed with their ids, the findings matched to existing cards, and anything the reviewer could not reach.

## Running it on a schedule

A sweep is worth most when nobody has to remember it. Run it weekly the way `fleet-steward`'s sweep runs: whatever schedules work on the machine that runs the fleet, starting a session whose agent is the lead and sending `/coder-fleet:sweep`. Its cards wait in To do for the human, like everything else the human has not ordered.
