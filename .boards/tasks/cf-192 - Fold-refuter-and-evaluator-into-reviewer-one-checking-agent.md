---
id: CF-192
title: 'Fold refuter and evaluator into reviewer, one checking agent'
status: Done
assignee: []
created_date: '2026-11-10 13:15'
updated_date: '2026-11-11 16:28'
labels: []
dependencies: []
priority: High
type: enhancement
ordinal: 322000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-11-11: "ther is a reviewer agent, a refuter agent, and an evaluator agent - it is too much. fold into one"

Decisions the human gave in the session (AskUserQuestion, 2026-11-11):
- Name: keep `reviewer`; `refuter` and `evaluator` go.
- Shape: one agent, one body; the lead's brief picks which modes a spawn runs (review the diff and run the gates always; break the change; use the running product).
- Mutation testing: kept only for authentication and credential paths and the harden phase, as today's build-phase rule already does.
- Contract: dropped. No contract-before-build step; the product check grades straight against the card's acceptance criteria.

Names reach 79 files across both ports, including agent-clock.sh, enforce-agent-scope.sh, the disabledAgents switch, the build/harden phase rule, review-round's lanes, the glossary, evals and fixtures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Claude Code plugin ships one checking agent, `reviewer`; the `refuter` and `evaluator` definitions, evals and fixtures are gone, and the roster (claude/README.md table, SubagentStop matcher, evals, docs/fleet-design.md) agrees on the smaller fleet
- [x] #2 The reviewer body has modes the lead's brief selects: review (read the diff, run the declared gates read-only) on every spawn; break (mutation testing) only on an authentication or credential path, or in the harden phase; use (run the product against the card's acceptance criteria) where AGENTS.md has an App start: line
- [x] #3 No contract step remains: the lead, glossary, review-round and docs carry no `Contract: <n> checks` comment or contract-mode spawn, and a product check grades against the card's acceptance criteria
- [x] #4 A break-mode reviewer run keeps a hard wall-clock cap enforced by a hook, with a contract test for it, and review-mode runs are not capped by it
- [x] #5 review-round spawns the merged reviewer instead of separate refutation and evaluation lanes, and its workflow logic tests pass
- [x] #6 A project whose .claude/coder-fleet.json lists refuter or evaluator under disabledAgents still loads and runs without error, and /coder-fleet:agents offers neither name
- [x] #7 bash claude/evals/lib/check-all.sh passes, and the migration-checklist skill has been run over every changed agent body and skill
- [x] #8 The release bumps the version in plugin.json and marketplace.json
- [x] #9 The reviewer records how long each step takes: as each step (each gate, each mutant, each acceptance criterion checked in use mode) starts and finishes, it appends a timestamped line to a progress log under docs/runs/ in the main checkout, so a long run shows which step it is on; its handoff ends Done with a per-step duration summary
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-10 13:16
---
Sub-issue 1 of 2: started. Done still needs: criteria 1-8, and CF-192.1 (OpenCode port).

Done: nothing yet - the human can't see any change.
Not done: the plugin still ships reviewer, refuter and evaluator as three agents. A coder is building the fold on the Claude Code side; the OpenCode port follows in CF-192.1 once that merges.

Lead defaults the coder needs that no criterion says: the lead's own body (claude/coder-fleet/agents/lead.md) is rewritten to route to the one reviewer; `disabledAgents` entries naming refuter or evaluator are ignored quietly rather than erroring; disabling `reviewer` is not offered, since every change needs an independent gate run.
---

author: lead
created: 2026-11-10 13:31
---
Security review findings on the in-progress branch, passed to the coder mid-run. The lead's default: the break-mode clock fails closed when the brief can't be read; the mode is recorded once at clock start and never re-read; the mode signal comes only from a fixed header in the spawn prompt, or from hook-owned state written at spawn time, never from a free-text match anywhere in the transcript.

Done: nothing merged; the plugin still ships three checking agents.
Not done: the fold itself, still with the coder.
---

author: lead
created: 2026-11-10 13:43
---
The human, 2026-11-11: "the new combined reviewer agent needs to record somewhere how long each step takes - namely when testing the criteria it has in the past taken a very long time and it looks like it is doing nothing"

Added as criterion 9. The lead's default for 'somewhere': a progress log appended live under docs/runs/ (git-ignored, so it is never committed), plus a duration summary in the handoff. Criterion checks in use mode are the case that matters most.

Done: nothing merged.
Not done: the fold and the timing log, both with the coder.
---

author: lead
created: 2026-11-10 13:44
---
The human, 2026-11-11, on the self-forged mode record: "I think I have come across that third finding - very annoying". The human may have seen it in practice, so a capped agent outliving its clock is a real failure, not a theoretical one. The fix must come with a contract test that fails on today's code.
---

author: lead
created: 2026-11-10 13:55
---
A third security review flagged the mode record again. The lead's default, sent to the coder: anchor the progress-log exception to the trusted project instead of cwd; compare protected paths case-insensitively on APFS; make the mode decision fail closed (a missing or garbled record means break mode, with the cap); deny the obvious Bash routes round the state directory. The residual gap goes in docs/limits.md: a same-user agent can still forge a well-formed record, which no hook running as the same user can prevent. No further security review rounds on this one record; anything left open is decided at the reviewer's review.

Done: nothing merged.
Not done: the fold, the timing log and these fixes, all with the coder.
---

author: lead
created: 2026-11-10 14:14
---
Coder handoff, 2026-11-11: branch cf-192-fold-refuter-and-evaluator-into-reviewer, nine commits ending e9ca5b1 (v0.51.0), check-all green at the head (exit 0, 37 sections).

Proposed by the coder (not filed; the human decides):
- Reword this repo's Definition of Done default (.boards/config.yml and board/src/test/dod-defaults-config.test.ts) from 'a refuter round ran' to the break-mode reviewer, with no disabled-refuter clause. Until then, CF-192's own DoD item 2 reads stale.
- Give the reviewer's smoke eval a break prompt and a use prompt, swapping out two of its five.
- Run the live probe in hooks README item 20 with a 'Modes: review, break' brief, to confirm the cap and the transcript timing end to end.

The lead's default on the tension the coder raised: a review-only run is capped only when its brief can't be read or is malformed. Any review run with a readable brief is uncapped, so criterion 4 holds as written. Fail-closed on an unreadable brief stays, because the alternative is the uncapped run the human has already been bitten by.

Done: the fold is built and the suite passes on the branch.
Not done: independent review (deeper, plus a second round, because the hooks are the fleet's authorisation layer); push and PR; CF-192.1 port.
---

author: lead
created: 2026-11-10 14:26
---
Refuter round on e9ca5b1, 2026-11-11: baseline check-all exit 0; 8 mutants, 2 killed, 6 survived.

For the fix round:
- survived: header window size not pinned. Nothing tests a Modes: line on brief lines 3 to 6, so shrinking the window to 2 reads a line-4 'Modes: review, break' as review, uncapped.
- survived: break-over-use precedence in enforce-agent-scope.sh has no scope test (only the clock tests 'Modes: review, break, use').
- survived: the column-0 anchor is unpinned. An indented '  Modes: review, break' should fail closed, and no test covers it; the existing near-miss also has the wrong case.
- low (rides the fix round): progress-log symlink check untested; log-path-is-a-directory check untested; dead direct-path branch in reviewer-modes.sh.
- usability: the session scratchpad path contains 'coder-fleet', so a break-mode reviewer is refused cd plus a script there by the indirect-path rule. docs/limits.md covers the repo path, not the scratchpad.

Done: the fold is built; the suite passes; three real test gaps found.
Not done: reviewer verdict (running), then one fix round.
---

author: @SubagentStop
created: 2026-11-10 14:26
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. 2 must-fix, 3 low, 2 follow-ups.
- Examined: the full diff `main...e9ca5b1` (70 files), the CF-192 card (state worktree copy), a live subagent transcript's first line, and lead.md and reviewer.md read as prose.
- Criteria: #1 holds (the `evaluator-app` fixture stays on purpose for `coder/prompts/05-long-card.md`). #2 holds. #3 holds: no contract step or `Contract:` comment is left in lead, glossary, review-round or design. #4 holds: a readable review or use brief is never capped, break mode is capped and has tests, and an unreadable brief is capped per the lead's default. #5 holds: main's review-round never had an evaluation lane, and the refutation lane is now a `coder-fleet:reviewer` whose brief line 1 is exactly `Modes: review, break`, pinned by workflow-logic `break-lane-is-a-reviewer`. #6 holds for load and run (disabled-agents-contract lines 570 to 590), but the `/coder-fleet:agents` contract itself is the emptied file. #7: check-all exits 0, but one section is empty. #8 holds: 0.51.0 in plugin.json and marketplace.json. #9: the body and the hook carry it, there is one prose tension (low below), and it hasn't been run live.
- Q1, can a readable review-only brief be capped? No. Only an unread brief, a malformed header or a garbled record caps a non-break run.
- Q2, can break mode lose its cap other than by the recorded forgery? Every route I found is recorded in limits.md: deleting or corrupting the clock file, a named spawn, `--agent reviewer` as the main agent, an unwritable state dir. A header past line 5 makes hook, body and scope agree on review, so the lane fails loudly rather than running uncapped.
- Q3, does the progress-log exception allow more? No. One line of `date [-u] '+<fmt>' >> <abs path>`, with the name matching `<date>-reviewer-<slug>-progress.log`, the directory physically equal to the session project's main-checkout `docs/runs`, no symlink and a regular file; plus `mkdir -p` of exactly that directory. It applies in review mode only, since break and use Bash is already open.
- Q4, is any retired path reachable? No. A refuter or evaluator type is denied every governed tool (enforce-agent-scope.sh line 447). Both names are gone from the SubagentStop matcher, the clock table, the roster and the write-scope roles. review-round logs a stale `disabledAgents` entry and ignores it.
- Q5, would a new test pass with its rule reverted? Yes, the empty agents-command file. Two narrower cases are under low below. The mode, sticky, five-line window, fail-closed, workflow-depth, crafted-repo and retired-type tests would each fail if their rule were reverted.
- Prose: lead.md step 4 routes correctly with no contract step. It names break by its triggers under the build-phase limit, and use mode after the review round and before its fix round, graded against the card's criteria. reviewer.md agrees with the hooks on the header, the default and the malformed case.
- gate: bash claude/evals/lib/check-all.sh - exit 0 - counts printed per section, all 0 failed (scope-hook 890, board-hook 268, workflow-logic 753, disabled-agents 150, board bun 359; agents-command printed none, 0.0s); total 277.1s after a 101s lock wait
- gate: bash claude/evals/lib/scope-hook-contract.sh - exit 0 - 890 passed, 0 failed
- gate: bash claude/evals/lib/board-hook-contract.sh - exit 0 - 268 passed, 0 failed
- gate: bash claude/evals/lib/handoff-parity.sh - exit 0 - counts not printed (32 cases, every verdict ok)
- After the gates, `git status --porcelain --ignored` in the review worktree showed only `!! claude/coder-fleet/board/node_modules/`, which was there before the run. HEAD was still e9ca5b1.
- must fix: claude/evals/lib/agents-command-contract.sh:1 - 4ae5a51 emptied the file to 0 bytes but left it executable, and check-all.sh:387 still runs it, printing `agents-command: ok (0.0s)`. The 68 cases pinning `/coder-fleet:agents` are gone: disable and enable round trips, byte-for-byte refusals, phase toggling. commands/agents.md:12 still says "a contract test pins it", and the commit message says the case was moved to researcher. The human running `/coder-fleet:agents disable researcher` or `phase harden` after a later fleet-agents.sh change has no gate behind it, and the green Done gate hides that.
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:553-559 - in break mode, any command that pairs `cd`, `pushd`, a glob, `$` or `~` with case-folded `state`, `.local` or `coder-fleet` is denied. That catches `cd /tmp/mut && npx vitest run -t "rejects a mismatched state"`, `useState`, `.env.local` and `real-estate`. The deny at line 2356 doesn't name the matched fragment or the pairing. A break-mode review of an OAuth or session change, the one place break runs in the build phase, gets its mutant runs refused without saying why, and hands back under Not done instead of a refutation. limits.md records only the coder-fleet-path case.
- low: claude/coder-fleet/agents/reviewer.md:38 - the invariant forbids creating any file inside the project except memory, while step 2 (line 30) requires appending a progress log under the main checkout's docs/runs. Name the log as the one exception in the invariant.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:538-545 - the write-tool half of `reviewer_protected_denial` is never tested on its own. `check-write-scope.py --outside` refuses the same paths, so deny_write against the modes, clocks and transcripts dirs (scope-hook-contract.sh lines 1782-1785) passes with either half reverted. Likewise `deny_bash reviewer` at line 1795 passes through the review gate allowlist alone.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:546 - review mode now refuses any Bash command naming `.claude/projects`, so grepping a gate's persisted output under `tool-results/` is refused. The Grep and Read tools still work. reviewer.md doesn't say so.
- Memory updated in the main checkout (the worktree path was refused): `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/agent-memory/coder-fleet-reviewer/cf-192-reviewer-modes-settled.md`, an addition to `gate-run-quirks.md`, and the `MEMORY.md` index entry. The lead commits them.
- Run article: above this handoff, for the lead to save as docs/runs/2026-11-11-reviewer-CF-192.md
---

author: lead
created: 2026-11-10 14:27
---
Reviewer round 1 on e9ca5b1, 2026-11-11: request changes. Criteria 1-5 and 8 hold; criteria 6, 7 and 9 have gaps. The hooks' security core holds up under every question asked.

must fix:
- agents-command-contract.sh was emptied to 0 bytes in 4ae5a51, and check-all still prints it 'ok (0.0s)'. The 68 cases pinning /coder-fleet:agents are gone.
- Break mode's indirect-path rule refuses ordinary mutation commands wherever 'state', '.local' or 'coder-fleet' appears next to cd, a glob, $ or ~: useState, an OAuth state test, .env.local, the session scratchpad. That covers exactly the auth reviews break mode exists for, and the deny message doesn't say what tripped it.

The lead's default for the second: drop the fragment-based indirect deny. It was best-effort, it is defeated by any script anyway, and fail-closed plus docs/limits.md already cover the forgery case. Keep the direct refusal of the full protected paths, and name the matched path in every deny message. This supersedes the 1(b) instruction from comment 5.

low (rides the fix round): reviewer.md invariant should name the progress log as its one in-project write; the write-tool half of reviewer_protected_denial is untested on its own; review mode now refuses Bash naming .claude/projects, so reviewer.md should say to use Grep or Read there.

The reviewer's unverified point on migration-checklist (criterion 7) is answered by the coder's handoff, which lists checks 1-3, 6-8 and 14-19 passing over reviewer, lead, spec-editor and the skill frontmatter.

Proposed by the reviewer, not filed: lead.md step 4 contradicts itself, and the contradiction predates this branch. Build phase says no break run outside auth 'not from you', yet the same step has the lead spawn one for a missing gate or its own fix commit.

Done: the fold built; suite green; review and refutation complete.
Not done: one fix round (2 must fix, 3 refuter survivors, lows), then a narrow second round.
---

author: lead
created: 2026-11-11 13:09
---
Sub-issue 1 of 2: started (fix round 1 running, 12 Nov 2026). Done still needs: criteria 1 to 9, the narrow second review, the pull request, and CF-192.1 (OpenCode port).

The human chose "Both at once" for CF-193 on 12 Nov 2026, which stacks CF-193's review-round, reviewer and lead changes on this branch, so its outstanding fix round runs now. A fresh coder builds it on top of fa712e1: the two must-fix findings from comment 9, the three surviving mutants from comment 7, and the lows. The second security ruling stands: the fragment-based indirect deny goes, the direct refusal of the full protected paths stays, and each deny names the path it matched.

Done: the fold is built, pushed, reviewed and refuted on a branch. Not done: the plugin still ships three checking agents; the fix round, its narrow review and the pull request.
---

author: lead
created: 2026-11-11 13:44
---
Fix round 1 landed, 12 Nov 2026: branch cf-192-fix-round-1, 11 commits on fa712e1 ending 669ca10, not pushed.
- Must fix 1: agents-command-contract.sh restored and brought to the folded fleet, with criterion 6's retired-name cases (bef3a73); 106 passed, 0 failed. check-all now fails a section whose script is an empty file (5f6eed1), watched failing first.
- Must fix 2: break mode's fragment-based indirect deny is gone, the direct refusal of the full protected paths stays and each deny names the path it matched (482da3f); five ordinary mutation commands are now allowed and three deny cases check the message, all eight failing before the change. docs/limits.md and hooks/README updated; the three old indirect-deny cases are removed, that route being the documented gap.
- Surviving mutants: the header window pinned at both edges (8298394), break-over-use precedence in the scope hook (2d8250c), the column-0 anchor (e15383e); each mutant applied, seen failing, and reverted.
- Lows: reviewer.md names the progress log as its one in-project write (481ab32) and says to use Read or Grep for saved gate output (6ef0c67); the write-tool half of the protected denial tested by reason (f938711); the progress log's symlink and directory checks tested and the dead branch removed (6920d1f).
Coder's check-all.sh exit 0, 330.5 s after a 218 s lock wait: scope-hook 907/0, board-hook 268/0, disabled-agents 150/0, agents-command 106/0, workflow-logic 753/0.

Unverified by the coder: its captured suite output looked corrupted mid-run though the run exited 0, so the reviewer reruns it clean; the empty-section guard fires only on a 0-byte file; nothing pins that break mode now allows a cd plus a relative path into the state directory; no live break-mode run.

Proposed by the coder (not filed): scope-hook-contract.sh's original `deny_bash reviewer` line (about 1795) still passes through the gate allowlist alone.

Next: the narrow second round the hooks earn as the fleet's authorisation layer, on fa712e1..669ca10, with the reviewer's own clean suite run.

Done: every finding from the review and the refutation is fixed on a branch. Not done: the second review, the pull request, the merge; the plugin still ships three checking agents.
---

author: lead
created: 2026-11-11 13:54
---
Review round 2 (fa712e1..669ca10): approve with follow-ups, no must fix; everything from round 1 and the refutation is resolved. Gates run by the reviewer from the review worktree at 669ca10: check-all.sh exit 0 (160.6 s, clean, settling the coder's corrupted capture), with agents-command at 106 passed. The reviewer read each new case against its mutant: the header window pinned at both ends, the column-0 anchor, break over use, the write-tool half by its own reason, the progress log's symlink and directory checks. No second refuter round: the first ran on e9ca5b1, its three survivors now each have a killing case the reviewer confirmed, and no test in the fix round is suspected of passing with its fix reverted.

Follow-up left open, to be filed as a Polish card at the end rather than a further round: check-all's new guard fails a section only when its script is 0 bytes; a contract cut down to a shebang or `exit 0` still prints ok. Closing it needs a decision on which sections legitimately print no counts.

Two lows ride the merge the coder is doing anyway: the progress-log comment at enforce-agent-scope.sh:1930 describes the cwd-anchored rule an earlier security round replaced, where the code anchors to the project's main checkout; and agents-command-contract.sh:433 is an absence check over commands/agents.md's prose, which AGENTS.md says invites the next mutant, while the behavioural cases above it already prove criterion 6.

Lead decisions for the merge: the branch takes main's version, 0.50.0, and drops its own 0.51.0 bump, because the human ordered one release at the end, on its own bump commit; CF-183.2 (memory routing) merges to main before this card, so this branch takes main in now and once more after that lands.

Reviewer's unverified points: no live break-mode run; migration-checklist not rerun over this round's two reviewer.md prose edits.

Done: the fold is built, refuted once and reviewed twice, with every finding closed. Not done: main merged in, the pull request, the merge; the plugin still ships three checking agents.
---

author: lead
created: 2026-11-11 14:01
---
12 Nov 2026: main (aa969fd, with CF-193.1, CF-193.2, CF-193.3 and CF-194) is merged into the branch as fdffba3, head now 9b6bfec, pushed as cf-192-fold-refuter-and-evaluator-into-reviewer and up as draft PR https://github.com/rzem-ai/coder-fleet/pull/144. Three files conflicted, none under hooks/: AGENTS.md (main's board sentence with the break-mode reviewer's cap named), docs/fleet-design.md (main's coder, scripter and ui-designer rows with this card's reviewer row; main's section 8 paragraph with looping preloaded into reviewer for break mode), and the coder's memory index (both sides kept). Two lows from round 2 fixed after the merge: the progress-log comment now says the log is anchored to the session's project (4e815bc, comment only), and the absence check over commands/agents.md's prose is gone (9b6bfec; agents-command 105/0). One stale README line fixed (75a4e90). Coder's check-all.sh exit 0, 101.7 s: scope-hook 907/0, board-hook 268/0, disabled-agents 150/0, agents-command 105/0, workflow-logic 753/0, roster 240/0.

Correction to the lead's last comment: the branch never carried a 0.51.0 bump, both sides were at 0.50.0, so there was nothing to drop. Criterion 8 is met by the release the human ordered.

migration-checklist (main's updated version) over reviewer.md and lead.md as merged: clean except check 10, which flags reviewer.md line 34's 'at most three must-fix findings a round' as a cap with no stated reason. Left for the human: give it a reason or drop it.

Stale refuter and evaluator wording left in the looping skill (lines 11, 19) and run-article (line 54, which is also out of date about the reviewer's progress-log write) belongs to CF-193.4, whose fourth criterion covers it.

Next: CF-183.2 merges to main first, this branch takes main in once more, and the pull request merges on green CI.

Done: the fold is on current main's base, reviewed twice, in a draft pull request. Not done: not merged; the plugin still ships three checking agents.
---

author: lead
created: 2026-11-11 14:56
---
12 Nov 2026: main at 126d23d (with CF-183.2's memory hook) is merged into the branch as f0c809f and pushed to PR #144. Two conflicts, neither needing a choice between entries: hooks.json's top-level description string only (main's string with the fold's clock clause; every hook group is main's except the fold's SubagentStop matcher, and main's five memory-state groups are byte for byte as main has them, with no retired name anywhere); and lead.md step 5, a word-level splice of main's memory sentences onto the fold's line, with word diffs against both parents showing only the memory sentences moved against the branch and only the fold's routing moved against main. The coder probed the scope hook on a fixture with a registered worktree: a reviewer in each mode can write its own memory there and in the main checkout, cannot write another agent's, is refused the mode record, the clock and a transcript, and a retired type is refused even a memory write. CF-183.2 brought no refuter or evaluator text. Coder's check-all.sh exit 0, 103.8 s: scope-hook 916/0, board-hook 268/0, memory-state 71/0, disabled-agents 150/0, agents-command 105/0, workflow-logic 766/0, roster 240/0.

Because this merge joins two changes to the hook registration and the scope checks, a reviewer is reading both merge resolutions and running the gates independently while CI runs; the pull request merges when both are green.
---

author: lead
created: 2026-11-11 15:03
---
Sub-issue 1 of 2: merged to main at ba1126f (PR #144, squash-merged by the lead on 12 Nov 2026 on the human's order). Done still needs: criterion 8 and Definition of Done 4, the release bump and tag the human ordered; and CF-192.1, the OpenCode port, which is in Next and starts now that this side has merged.

Before the merge: a reviewer read both merge resolutions (fdffba3, f0c809f) and the three small commits between them, and approved with one low and no must fix. hooks.json is main's file exactly plus the fold's SubagentStop matcher and clock clause, with main's five memory-state entries unchanged and no retired name in any matcher; hooks matched in one event run in parallel, so order carries no weight. In the scope hook, retired types are denied first, then main's memory allow, then the reviewer's protected-path deny in every mode, then the mode rule: a reviewer in any mode can write its own memory in a registered worktree and in the main checkout and nothing new; a retired spawn can write nothing. The memory hook returns early for any write outside the agent's own memory directory and never fires on the progress log, which is a Bash append. In review-round.js a diff carrying board or memory files blocks before the break lane could spawn. lead.md step 5 is main's word for word apart from the fold's two routing spots. No test passes for the wrong reason. Gates from the coder's worktree at f0c809f: check-all.sh exit 0 (104.3 s; scope-hook 916/0, board-hook 268/0, workflow-logic 766/0, memory-state 71/0), scope-hook 916/0, handoff-parity 32 agree. CI on f0c809f: deterministic pass in 5m41s.

Ticked on evidence across round 1, the refuter round, fix round 1, round 2 and the merge review: criterion 1 (one checking agent; the roster agrees, roster 240/0), 2 (the three modes and when each runs), 3 (no contract step or `Contract:` comment anywhere), 4 (break mode's cap enforced by agent-clock.sh with contract cases, review-mode runs uncapped), 5 (review-round's break lane is a reviewer, workflow-logic 766/0), 6 (a config listing either retired name loads and runs, and /coder-fleet:agents offers neither, agents-command 105/0), 7 (check-all exit 0 and the migration-checklist findings in PR #144), 9 (the reviewer body and the scope hook carry the progress log and the per-step durations; contract cases pin the log's path, its symlink and directory refusals). Definition of Done: 1 CI on f0c809f; 2 two review rounds approved and a break round ran on the hooks; 3 the findings are in PR #144; 5 not applicable on this card: the port's artefacts change in CF-192.1; 6 not applicable: no spec.

Left open, for the Polish card filed at the end: check-all's empty-contract guard fires only on a 0-byte file; scope-hook-contract.sh pins a break-mode reviewer's memory in the main checkout only, not a use-mode reviewer's or either mode's in a registered worktree. For the human: reviewer.md's 'at most three must-fix findings a round' has no stated reason.

Not verified by a run: no live break-mode or use-mode reviewer, and no live progress log.

Done: on main, the plugin ships one checking agent with review, break and use modes. Not done: not released; the OpenCode port still ships a refuter.
---

author: lead
created: 2026-11-11 16:05
---
Released in v0.51.0, 12 Nov 2026: the bump is b53330a (PR #150, merged at 50d15ac), the annotated tag v0.51.0 is on it and pushed, and the flush landed e552c9d. Ticked: criterion 8 and Definition of Done 4. Done still needs: nothing on this card; its OpenCode half, CF-192.1, is merged with one question open for the human, and the Polish child CF-192.2 waits in To Do.

Done: v0.51.0 ships one checking agent, reviewer, with review, break and use modes. Not done: no live break-mode or use-mode run has been made.
---
<!-- COMMENTS:END -->
