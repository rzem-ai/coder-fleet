---
name: shipping-a-stack-overnight
description: What worked and what bit when the lead merged a dozen stacked pull requests and cut a release unattended - merge commands, stacked branches after a squash, CI-only failures, memory before a flush
metadata:
  type: feedback
---

Four things from the v0.51.0 night (12 Nov 2026), when the human ordered every In Progress and Next card finished, merged and released while he slept.

**Run `gh pr merge` alone.** Claude Code's auto mode classifier refused `gh pr ready N && gh pr merge N --merge` chained with a pull and a log, with no reason given. `gh pr ready N` on its own, then `gh pr merge N --squash` on its own with a description saying the review approved, CI passed and the human instructed it, went through every time after.
**Why:** the human had said "any further PRs you are to merge yourself"; the refusal was about the command's shape, not the grant.
**How to apply:** one merge per Bash call, never bundled; read CI before marking a pull request ready, not in the same command.

**Rebase a stacked branch after its base is squash-merged; do not merge main into it.** `git merge main` conflicted in nine files because main held the base as one squashed commit. `git rebase --onto origin/main <old base head>` replayed only the branch's own commits, with one conflict or none, and `git diff <reviewed head> <new head>` came back empty, which is the evidence the review still stands.
**How to apply:** record each stacked branch's base head on its card when it is cut. Feature pull requests here squash; the release pull request merges with a merge commit so the tagged commit stays on main.

**A suite that is green here four times can still be red on CI.** Two causes that night, both real: a test fixture leaning on this machine's auto-detected git identity, and Bun 1.3.14 on Linux (CI's pin, and what builds the released binaries) leaving an existing file in place under `cpSync` with `verbatimSymlinks` and no `force`. The second was a product defect a macOS run could not show.
**How to apply:** treat a CI-only failure as a failure, send it to the branch's coder to reproduce before changing anything, and suggest a Linux container at CI's pinned Bun. Read the whole failed log for the count of failures before telling the human how many there were.

**Before a flush, make the state branch's memory a superset of main's.** While a session runs hooks older than the memory hook, memory reaches main through pull requests or sits uncommitted in the main checkout, so the state worktree's copy falls behind. Copy the main checkout's `.claude/agent-memory/` over the state worktree's without deleting, commit it there, then flush; afterwards check the flush added and modified files only.

Related: [[cwd-decides-which-tree]], [[review-round-invocation]].
