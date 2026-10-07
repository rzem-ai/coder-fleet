---
id: CF-138
title: Strip '---' lines from the TaskCompleted failure comment
status: In Progress
assignee: []
created_date: '2026-10-05 12:17'
updated_date: '2026-10-07 00:28'
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

created: 2026-10-07 00:18
---
Built: branch cf-138-gate-comment-dashes, commit 5807a61, pushed. board_defang_delimiters in hooks/lib/board.sh, called from board_comment_raw (the one door for every hook comment), rewrites a line that is only three dashes plus whitespace to `- - -`. Covers the TaskCompleted gate comments, the SubagentStop Blocker and handoff comments, the SubagentStart refused-move note and board-agent-return.sh. Two contract cases, gate-comment-dashes (stub) and live-gate-comment-dashes (real binary), failed before the fix (232 passed, 2 failed) and pass after (234 of 234); check-all.sh exit 0 (126.5 s). A refuter runs on it now (board write path). Proposed by the scripter and held for the human: the same helper passes the board's own HTML comment markers through unchanged, which the board refuses the same way; the lead's first attempt at this comment was refused for quoting one, which shows the failure mode is real.
---

author: @SubagentStop
created: 2026-10-07 00:28
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/check-all.sh` in the scratch copy `$S/base` at 5807a61, run once and alone: rc=0, total 168.2s. The hook contract alone showed 234 passed, 0 failed across 4 shards in 125.3s, with `gate-comment-dashes` and `live-gate-comment-dashes` both ok. `$S` = `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/b60f21ed-bab8-46da-b450-232af096a73a/scratchpad/refuter-1791332295`. The board section did not time out, so no rerun was needed.
- Probes went through `$S/tools/probe.sh`. It sources the branch's `board.sh`, calls `board_defang_delimiters`, and checks the output with `$S/tools/jscheck.js`, an exact copy of the body check in `backlog.ts` (`\r\n` to `\n`, trim, then `/^\s*---\s*$/m`).
- Probes the board accepts and leaves byte-identical: `----`, `--- x`, `x ---`, and `%` and backslash in the text.
- Probes the board accepts after rewriting to `- - -`, with every other byte unchanged: ` \t--- \t`, `\v---\f`, CRLF `---\r\n` (that line's `\r` is dropped and the others keep theirs), `---` as the first line, as the last line, as the whole body, `  ---  ` as the whole body, and three consecutive `---` lines.
- Probes the board refuses, each output byte-identical to its input (reviewer-kind: the change is wrong for these inputs, not just untested): lone CR `a\r---\rb`, non-breaking space `\xc2\xa0---`, U+2028 `a\xe2\x80\xa8---`, BOM `\xef\xbb\xbf---`. Cause: JS `\s` and the `/m` line terminators cover these, and `LC_ALL=C [[:space:]]` with line-based `sed` does not.
- Mutants: each ran `bash claude/evals/lib/board-hook-contract.sh` in its own copy `$S/m<N>`, all eight in parallel with their own TMPDIRs, each taking about 312s.
- killed M4, `[[:space:]]*` removed so only `^---$` matches: rc=1, `gate-comment-dashes` FAIL.
- killed M5, the `text="$(board_defang_delimiters ...)"` line deleted from `board_comment_raw`: rc=1, both cases FAIL.
- killed M7, `printf '%s' "$fixed"` changed to `printf "%s" "$text"`: rc=1, both cases FAIL.
- killed M8, precheck changed to `printf '%s\n' "$text" | head -1 | LC_ALL=C grep ...`: rc=1, both cases FAIL.
- survived: in `board_defang_delimiters`, `[[:space:]]*` replaced by ` *` in both the grep and the sed (M3) - a tab-indented `---` line goes through unchanged and the board refuses the comment, so the CF-138 failure comes back for tab output; rc=0, 234 passed.
- survived: sed `s/^[[:space:]]*---[[:space:]]*$/- - -/` changed to `s/^.*---.*$/- - -/` (M6) - any line containing `---` is replaced whole, so `see a --- b` becomes `- - -` and content is erased; rc=0, 234 passed.
- survived: `^` removed from both the grep and the sed patterns (M1) - `x ---` becomes `x- - -`, rewriting a line the board accepts; rc=0, 234 passed.
- survived: `$` removed from both the grep and the sed patterns (M2) - `--- x` becomes `- - -x`; rc=0, 234 passed.
- low: `claude/evals/lib/board-hook-contract.sh:1983` - the stub case's text has no tab-indented `---` and no near-miss lines (`----`, `--- x`, `x ---`), so its "every other byte unchanged" check never meets a line the anchors or the whitespace class decide. This is the gap M1, M2, M3 and M6 come through.
- Budget: eight mutants, all run. About 10 of the 20 minutes used. This is the first round on CF-138, so there is nothing to compare for convergence.
---

created: 2026-10-07 00:28
---
Refuter round 1 on 5807a61 (2026-10-07): baseline check-all.sh exit 0 (168.2 s). Eight mutants: four killed (whitespace removed entirely, the call site removed, posting the original text, checking only the first line), four survived (whitespace narrowed to spaces so a tab-indented line is still refused; any line containing three dashes wiped; either anchor dropped, which rewrites lines the board accepts). Probes found a defect beyond the tests: the board's check is JavaScript, whose whitespace class and multiline anchors cover a lone carriage return, non-breaking space, U+2028 and a byte-order mark, none of which the shell rewrite sees, so those comments are still refused. The lone carriage return comes from spinner and progress output, so it is the CF-138 failure itself. Fix round 1 commissioned: match the board's exact semantics, plus cases for the tab, the near-miss lines and the four refused inputs.
---
<!-- COMMENTS:END -->
