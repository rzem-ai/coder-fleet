---
id: CF-138
title: Strip '---' lines from the TaskCompleted failure comment
status: In Progress
assignee: []
created_date: '2026-10-05 12:17'
updated_date: '2026-10-07 00:17'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-task-completed.sh
  - CF-21
priority: Medium
type: bug
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lead on 2026-10-05. When check-all fails, board-task-completed.sh posts the last lines of its output as a card comment. check-all prints a standalone `---` line before its FAILED summary, and the board refuses comment bodies containing standalone `---` lines ("Comment body cannot contain standalone '---' delimiter lines"). So the card moves to Blocked with no comment saying why. Seen on CF-128 at 12:15:59Z. Related to CF-21 (board commits that fail silently). Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A failing test gate's comment reaches the card even when the output holds standalone '---' lines (escaped or rewritten), and names the failing check
- [ ] #2 board-hook-contract.sh has a case with '---' in the gate output, seen failing first
- [ ] #3 check-all.sh is green
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
created: 2026-10-06 14:06
---
2026-10-07, lead. Two things. (1) This card is In Progress with no branch, no commit, no PR and no comment: nothing was built. It moved on 2026-10-05 at 13:07Z when a spawn for other work bound to it through a stale focus (the CF-70 bug, fixed in v0.37.1). It belongs in To Do; the lead writes no column, so the human is asked to move it back. Still not ordered. (2) The lead filed CF-150 today for the same fault on the human's go to file what the hook log showed, without finding this card first. CF-150 is archived as a duplicate. Its evidence belongs here: three more `[TaskCompleted] board task edit failed (exit 1): Comment body cannot contain standalone '---' delimiter lines.` lines in hooks.log since 2026-10-05T12Z.
---

created: 2026-10-07 00:09
---
Ordered: the human moved this card into Next on 2026-10-07. Sub-issue 1 of 1: started. Done still needs: criteria 1 to 3.

Done: nothing yet; a scripter is being spawned. Because the hook writes board comments (a board write), a refuter runs on the change before it merges, per lead.md step 4.

Not done: a failing gate's comment with a standalone '---' line is still refused by the board, so the card moves to Blocked with no reason.
---

author: @SubagentStop
created: 2026-10-07 00:17
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Commit `5807a61` "Rewrite standalone --- lines in hook comments so the board accepts them (CF-138)", on branch `cf-138-gate-comment-dashes`, cut from origin/main. The worktree had come up on `worktree-agent-afc6c5a54ef280a28`, so I switched it with `git checkout -b cf-138-gate-comment-dashes origin/main`.
- `claude/coder-fleet/hooks/lib/board.sh`: new `board_defang_delimiters HOOK ID TEXT`, called from `board_comment_raw`. A line that is only `---` plus whitespace (the board's own `^\s*---\s*$` test in `backlog.ts`) becomes `- - -`. Text without such a line is printed untouched, and the rewrite is logged.
- Paths now covered, because `board_comment_raw` is the one door for every card comment. Through `board_write`: the `TaskCompleted` test-gate failure, strict-gate and card-gate comments, the `SubagentStop` Blocker comment, and the `SubagentStart` refused-move note. Through `board_comment`: the `SubagentStop` clean handoff comment and the `board-agent-return.sh` comment.
- Not covered: the archive copy of a cut comment keeps the original text.
- `claude/coder-fleet/hooks/README.md`: one paragraph under "Comment length" saying the above.
- `claude/evals/lib/board-hook-contract.sh`, new case `gate-comment-dashes` (offline): a fail status holding `---` and `  ---  ` lines must reach the stub as exactly two `- - -` lines, with no standalone `---` left, `some.test.ts: ok` and `FAILED: parser.test.ts` intact, and exit 2.
- `claude/evals/lib/board-hook-contract.sh`, new case `live-gate-comment-dashes` (real binary, the one that refuses): a failing gate containing `---` must leave the card Blocked with an `@TaskCompleted` comment containing `FAILED: parser.test.ts`.
- Ran `BOARD_HOOK_SHARDS=1 bash claude/evals/lib/board-hook-contract.sh` before the fix: 232 passed, 2 failed, and the two failures were exactly the two new cases. After the fix: 234 passed, 0 failed.
- Ran `bash claude/evals/lib/check-all.sh` once: rc=0, "Every deterministic check passes", total 126.5s. The board section was green with 301 pass, 0 fail, 121.8s. It did not time out, so I ran no separate rerun.
- The change that makes each new test fail: removing the `board_defang_delimiters` call in `board_comment_raw`. That is how the tests failed before the fix existed. I did not run a separate mutant afterwards.
---
<!-- COMMENTS:END -->
