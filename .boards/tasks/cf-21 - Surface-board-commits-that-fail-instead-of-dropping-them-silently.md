---
id: CF-21
title: Surface board commits that fail instead of dropping them silently
status: Done
assignee: []
created_date: '2026-09-27 02:36'
updated_date: '2026-10-07 01:33'
labels:
  - outcome/shipped
dependencies: []
references:
  - claude/coder-fleet/board
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/commands/kickoff.md
priority: High
type: bug
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-09-27: a stale .git/index.lock (mtime 11:39 AEST, no git process holding it) made every board commit fail from about 01:24 UTC. The MCP server's writes stayed on disk - CF-12 to CF-19 untracked, CF-6 and CF-8 edits unstaged, one CF-9 write staged but never committed - and nothing in ~/.local/state/coder-fleet/log/hooks.log said so (zero "commit skipped" lines). It surfaced only when `git pull` refused to run after PR #2 merged. The lead removed the lock and committed the writes (66f1e0f before rebase). Make a failed or skipped board commit visible: log it from the MCP server path too, and consider a check (kickoff, or the next board write) that notices uncommitted .boards changes or a stale lock and says so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A board write whose commit fails or is skipped leaves a log line the human can find, from both the hook path and the MCP server path
- [x] #2 Kickoff (or another routine check) reports uncommitted .boards changes and a stale .git/index.lock
- [x] #3 A test covers the skipped-commit log line
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-07 00:17
---
Ordered: the human moved this card to the top of Next on 2026-10-07. Sub-issue 1 of 1: started. Done still needs: criteria 1 to 3.

Done: nothing yet; a coder is being spawned. It writes board state (the commit path), so a refuter runs before merge (lead.md step 4).

Not done: a failed or skipped board commit still leaves no trace.
---

author: @SubagentStop
created: 2026-10-07 00:21
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Scope: all quotes below were read on main at `/Users/alex/Dev/Work/extensions/coder-fleet`. Sub-issue PRs: CF-24.1 = PR #53 (merge b1707b9), CF-24.2 = PR #48 (9bf1b3e), CF-24.3 = PR #52 (0dddb3f), CF-24.4 = PR #56 (275941c, v0.31.0). CF-24.1 to .3 were released in v0.29.0 (1afb9a6, PR #54). Plugin and marketplace are now both 0.39.2.
- C1 met (who ticks; design s7, help-boards, lead.md, agent-contract.md): `docs/fleet-design.md:144` "Only the lead ticks an acceptance criterion or a Definition of Done item, and only on evidence ... A tick is a field edit through `task_edit`, never a column write".
- C1 `claude/coder-fleet/agents/lead.md:33` (step 5) "Only you tick an acceptance criterion or a Definition of Done item, and only on evidence ... Judge done against the card's criteria and Definition of Done ... never a column."
- C1 `docs/agent-contract.md:82` (the card says `:80`, moved) "ticks acceptance criteria and Definition of Done items, edits the Definition of Done, replaces provisional criteria with the spec's ... A tick is a field edit, and none of them moves a column."
- C1 `claude/coder-fleet/skills/help-boards/SKILL.md:48` "Ticks are field edits, never column writes. Only the lead ticks ...".
- C1 no sentence says an agent makes no board write: `rg 'no board write|makes no board'` over `claude`, `docs` and `README.md` finds only spec text in `docs/specs/CF-24.md`, `hooks/README.md:107` (the "disabled" file) and `migration-checklist/SKILL.md:90` (about status writes).
- C1 test: none; prose is not covered by a contract case. Landed by CF-24.1: 3c1f5db (lead.md), 328cef1 (agent-contract and design s7), 187e538 (board-conventions, now help-boards), 45f88f5 (not-applicable tick).
- C2 met: `lead.md:33` "`Sub-issue <n> of <m>: <started | ready to merge in PR #<n> | merged to main at <sha>>. Done still needs: <criteria numbers or sub-issues>.`, an item not split being sub-issue 1 of 1". It adds a `ready to merge in PR #<n>` state the criterion text does not list (316ba3b, b755810). Test: none. Landed by CF-24.1: 3c1f5db.
- C3 met: `claude/coder-fleet/hooks/board-task-completed.sh:277` `if [ "$BOARD_ITEM_AC_COUNT" -gt 0 ] && [ "$BOARD_ITEM_OPEN_COUNT" -eq 0 ]; then`, and the else at line 283 logs "unticked item(s); moving to "$BOARD_COL_BLOCKED" and blocking completion". `hooks/README.md:275` describes it.
- C3 tests in `claude/evals/lib/board-hook-contract.sh`: `cg-unticked-criterion` (1945), `cg-unticked-dod` (1951), `cg-no-criteria`, `cg-all-ticked` (1965), `cg-test-fail-wins` (1976), plus `cg-no-dod-ticked`, `cg-comment-lists-unticked`, `cg-no-criteria-no-tick-advice` and the `cg-checked-*` cases. Refuter round 2 killed 8 of 8 mutants; baseline 204 passed, 0 failed. Landed by CF-24.4: c6a0610, 92d9697, 52400e1, ad130fc (v0.31.0); docs 123e184, 067107c, 9998121.
- C4 met: `board-task-completed.sh:308` (strict) "could not read the criteria and Definition of Done of $page_id, and the gate is strict; blocking completion"; `:313` (lenient) "CODER_FLEET_TEST_GATE is lenient, so it goes through unchecked". `hooks/README.md:271` states it beside the gate description.
- C4 tests: `cg-unreadable-strict` (1996), `cg-unreadable-lenient` (2002), `cg-unreadable-shape-strict`, `cg-unreadable-item-strict`, `cg-unreadable-shape-lenient`, `cg-unreadable-comment`. Landed by CF-24.4: ad130fc.
- C5 met: `docs/limits.md:9` "The card gate sees only a `[board:<id>]` task completed with `TaskUpdate` ... needs `CLAUDE_CODE_ENABLE_TODO_TOOLS` (CF-20, above) ... the gate cannot see the human moving a card to Done in the web UI". `hooks/README.md:282` "It cannot see the human moving a card to Done in the web UI." Landed by CF-24.4: 123e184, 067107c, 9998121.
- C6 met: tests in `claude/coder-fleet/board/src/test/require-acceptance-criteria.test.ts`: "the require_acceptance_criteria config key" (76), "Core.createTaskFromInput with the key on" (97), "...with the key absent or off" (124), "board task create (CLI)" (145), "MCP task_create" (167, tool error), "POST /api/tasks (web UI)" (216, 400), "promoting a Draft counts as a create" (297), "a live config reload with a malformed value" (375).
- C6 also `claude/coder-fleet/board/src/test/web-drafts-promote-error.test.tsx`; both files are in `BOARD_TESTS` in `claude/evals/lib/check-all.sh`. Landed by CF-24.3: daa4b5d, 7c29052, ac88544, 4407f78, 2c89eb1.
- C7 met: `.boards/config.yml:22` and `claude/coder-fleet/templates/board.config.yml:20` both `require_acceptance_criteria: true`. Template line 19 "Set require_acceptance_criteria: false to turn this off." `claude/coder-fleet/commands/init.md:45` (step 2b) says it is on and how to turn it off.
- C7 test: `require-acceptance-criteria.test.ts:260` "the shipped configs switch the requirement on (CF-24 criterion 7)" and `:272` "the template says how to turn the requirement off". Landed by CF-24.3: 51e97fb.
- C8 met: `claude/coder-fleet/agents/fleet-steward.md:28` "Every item you file carries acceptance criteria that state what closing it means ... an item with none is one nobody can close."
- C8 eval: `claude/evals/fleet-steward/checks.sh:34` and `:102` "PASS FS-criteria the items it files carry acceptance criteria"; rubric `claude/evals/fleet-steward/rubric.md:16` (FS01f) and `:38` (FS04e); contract `claude/evals/lib/steward-checks-contract.sh` (35 cases, 13 mutants).
- C8 migration-checklist: the CF-24.1 comment cites "PR #53 (comment 5912223980)", which I did not open. Landed by CF-24.1: 3b5bb09, 80f9151, fe87510, f2a9421, 11ce214, 331a833.
- C9 met: `lead.md:33` "one filed ahead of its spec carries provisional ones ... at sign-off you replace them with one card criterion per spec criterion, same number; in a project that names a requirements source and has no spec, an item's criteria are the requirement clauses it answers, in clause order ... a revised spec means rewriting the list."
- C9 `help-boards/SKILL.md:118` (card says `:115`) "Where the card and the spec disagree on wording, the spec wins." Test: none. Landed by CF-24.1: 3c1f5db, 316ba3b (clause case), 187e538.
- C10 met: `.boards/config.yml:12-18` `definition_of_done:` six items, none containing "plan". Item 2 now reads "The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round ... when .claude/coder-fleet.json disables the refuter", longer than the original.
- C10 test: `claude/coder-fleet/board/src/test/dod-defaults-config.test.ts:44`, `:61` "carries the default Definition of Done, with no plan in it", `:68` "gives a newly created item every default, unticked and in order"; `REPO_DEFAULTS` at line 17 matches the config. Landed by CF-24.2: 16df40e.
- C11 met: `claude/coder-fleet/templates/board.config.yml:12-16` four items (checks pass, reviewer approved, docs updated, "The spec, where there is one, is linked as a reference"), no plan. `claude/coder-fleet/commands/init.md:44` says it is there and that the human edits it in `.boards/config.yml`. Test: same `dod-defaults-config.test.ts` (`TEMPLATE_DEFAULTS`, line 26). Landed by CF-24.2: 16df40e.
- C12 met: commit 61aa4d5 "Backfill the Definition of Done defaults and provisional criteria". The CF-24.2 comment says "87 added, 12 provisional (all To Do backlog cards), 28 skipped, no failures. `shasum -c` over the 28 closed files' checksums ... all OK, byte-identical".
- C12 state on main now: `grep -L 'DOD:BEGIN'` over `.boards/tasks/*.md` gives 28 files, none of them among the 105 files with status To Do, Next, In Progress or Blocked; `grep -L 'AC:BEGIN'` gives no files.
- C12 test: `claude/evals/lib/board-backfill-contract.sh` (B02, B03, B12, B16, B17, B20 and others) in `check-all.sh`; script `claude/coder-fleet/scripts/board-backfill.sh`. Landed by CF-24.2: d0e022a, 91a1031, c0ec47f, run at 61aa4d5.
- C13 met: `lead.md:33` "Those comments are the progress record, and Implementation Notes is the human's field, never yours." `help-

[Cut to fit a board comment. The other 1339 characters, and this text in full, are in /Users/alex/.local/state/coder-fleet/archives/b60f21ed-bab8-46da-b450-232af096a73a/20261007T002141Z-coder-fleet_scout.md]
---

author: @SubagentStop
created: 2026-10-07 00:40
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Criteria 1 and 3 (`e3d67cd`, "Log every skipped or failed board commit to hooks.log"): the binary now writes the log line itself, through new `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-ad9e1031f4c08a8cf/claude/coder-fleet/board/src/git/board-log.ts`. It finds the log file the same way `board.sh` does (`BOARD_LOG_FILE`, then `CODER_FLEET_STATE_DIR`, then `XDG_STATE_HOME`) and writes lines in the hook library's format.
- A deliberate skip is logged as `[board] commit skipped (writer X) for "<action>": <reason>`. The reasons are `CODER_FLEET_BOARD_NO_COMMIT=1`, a gitignored `.boards`, no repository, and `auto_commit` not true (logged from `shouldAutoCommit` in `core/backlog.ts`).
- A failure is logged as `commit failed`, for a git add or commit refusal, or a lock still held after three retries. The lock message gives the lock's absolute path and the fix. Failures still go to stderr too.
- The MCP server path is covered because it runs the same `commitBoard`. Its lines read `(writer mcp)`.
- New test `src/test/board-commit-log.test.ts` is added to BOARD_TESTS. Before the change was wired in, 6 of its 10 tests failed. Making the success and no-op paths log fails the two "logs nothing" tests (I ran that mutant).
- `src/test/test-preload.ts` now points `BOARD_LOG_FILE` at a temp file. Most test boards have `auto_commit` off, so without this the suite would write thousands of lines into the real hooks.log.
- Hook path (`226b47a`, "Hand the hooks log path to the board binary from board_cli"): `board_cli` in `hooks/lib/board.sh` now exports `BOARD_LOG_FILE` to the binary. A path set in board.env was a plain shell variable the binary never saw. This is the only change to board.sh, inside `board_cli`, away from CF-138's comment helper.
- New contract case `cli-passes-log-file` failed before the export and passes after.
- New live case `live-commit-failed-logged`: a hook move under a stale `index.lock` still lands on disk and logs `commit failed (writer SubagentStart) ... index.lock`. Removing the failed-path log call makes it fail (mutant run). I added it after the logging change, so I only watched it fail through that mutant.
- `a3959d8`: `board-backfill-contract.sh` now sets `BOARD_LOG_FILE` to its temp directory. Its `NO_COMMIT` writes would otherwise log into the real hooks.log.
- Criterion 2 (`a2e2210`, "Have kickoff report uncommitted board writes and a stale index.lock"): new `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-ad9e1031f4c08a8cf/claude/coder-fleet/scripts/board-git-check.sh`, which the kickoff Board check runs. It always checks the main checkout, even when run from a worktree.
- The script lists every uncommitted file under `.boards` (using `--untracked-files=all`, so new items are named one by one; the focus file is left out).
- A lock counts as stale once it is at least `BOARD_LOCK_STALE_SECONDS` old (default 300) and no process holds it open, checked with `lsof`, or `pgrep -x git` without it. A younger or held lock is only a note. The script exits 1 when it finds something and prints the fix. It never deletes the lock or commits.
- Contract `claude/evals/lib/board-git-check-contract.sh` is wired into check-all and passes under `/bin/bash` 3.2 too. Before the script existed, 19 of its 24 cases failed. Five mutants were all caught, after I added a case for a board whose focus file is not gitignored.
- `e0ddaea`: docs updated in `README.md`, `hooks/README.md` (which wrongly said `board_cli` captured the errors) and the `help-boards` skill body.
- `1fb9140`: `v0.39.3` bump in `plugin.json` and `marketplace.json`. origin/main was still 0.39.2 when I fetched just before the bump.
- Commands run: `bun test` on the new test plus `git-commit`, `no-git`, `mcp-server` and `cli-board-behaviour`: 44 passed. `bunx tsc --noEmit`: exit 0. `shellcheck` on both new scripts: clean.
- Commands run: `BOARD_HOOK_SHARDS=1 board-hook-contract.sh`: 234 passed, 0 failed. The five contracts that read kickoff, plus `suite-coverage`: all exit 0.
- Commands run: `bash claude/evals/lib/check-all.sh` once: rc 0, 155.6 s total, "Every deterministic check passes". The machine's load average was about 94 at the time.
---

created: 2026-10-07 00:40
---
Built: branch cf-21-board-commit-failures, six commits from origin/main, version 0.39.3, check-all.sh exit 0 (155.6 s). Cause of the 2026-09-27 silence: a board write whose commit fails still exits 0, so board_cli dropped its stderr, and the MCP server's stderr goes only to the client's MCP log. The fix: the binary logs its own `commit skipped` (with the reason) and `commit failed` (with the lock path and the fix) lines to hooks.log through src/git/board-log.ts, for both the hook and MCP paths (criterion 1); board_cli exports BOARD_LOG_FILE; tests board-commit-log.test.ts (6 of 10 failed first), cli-passes-log-file and live-commit-failed-logged (criterion 3). Criterion 2: scripts/board-git-check.sh, run from kickoff's Board check, lists uncommitted .boards files and reports a stale index.lock (300 s, no holder) without deleting it; contract board-git-check-contract.sh, 19 of 24 failed first. Waiting for review and a refuter until CF-138's fix round finishes, to keep the machine's load down. Proposed and held for the human: run the git check from a SessionStart hook too; biome errors on main in core/backlog.ts. Note: the installed ~/.local/bin/board needs install-home.sh rerun before any of this logs.
---

author: @SubagentStop
created: 2026-10-07 01:04
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `check-all.sh` exit 1 in 291s. The board section failed on `src/test/focus.test.ts` "board focus > sets, shows and clears", a 10s timeout under concurrent load (314 pass, 1 fail). Rerun alone: `bun test --timeout=10000 src/test/focus.test.ts` exit 0 in 3s, an intermittent failure outside CF-21.
- Narrow baselines: `bun test --timeout=10000 src/test/board-commit-log.test.ts src/test/git-commit.test.ts` 28 pass in 28s. `board-git-check-contract.sh` 25 passed in 15s. `board-hook-contract.sh` ok in 270s within the full run.
- Budget: 8 mutants and 20 min. Used 8 mutants and about 9 min.
- survived: `claude/coder-fleet/board/src/git/operations.ts` ``return failed(`git add: ${add.err}`);`` -> `return false;` - a `git add` that fails for any reason other than the index lock logs nothing to hooks.log or stderr. 28/28 pass, exit 0.
- survived: `claude/coder-fleet/board/src/git/board-log.ts` `CODER_FLEET_STATE_DIR || join(XDG_STATE_HOME || ...)` -> `(XDG_STATE_HOME ? join(XDG_STATE_HOME,"coder-fleet") : CODER_FLEET_STATE_DIR) || join(homedir(),".local","state","coder-fleet")` - with both variables set, the binary writes to a different log than `board.sh`, whose line 20 lets the state dir win. Nothing tests that case. 28/28 pass, exit 0.
- killed m1: `board-git-check.sh` holder line -> `holder=""`. Caught by "held lock: is not called stale" and "held lock: names the holder". Exit 1.
- killed m2: `board-git-check.sh` stale threshold forced to 999999999. Caught by "stale lock: exits 1", "names the lock" and "gives the fix". Exit 1.
- killed m3: `operations.ts` git commit `failed(...)` -> `skipped(...)`. Caught by "logs a git commit refusal as a failure". Exit 1.
- killed m5: `backlog.ts` auto_commit-off `logBoardCommit` removed. Caught by "names auto_commit being off". Exit 1.
- killed m7: `hooks/lib/board.sh` `export BOARD_LOG_FILE` removed. Caught by `cli-passes-log-file` (248 passed, 1 failed). Exit 1.
- killed m8: `operations.ts` index-stayed-locked `failed(` -> `skipped(`. Caught by the stale-lock test and the MCP-writer test. Exit 1.
- low: claude/evals/lib/board-hook-contract.sh:2401 - `live-commit-failed-logged` still passed with `export BOARD_LOG_FILE` removed. It does not check that `board_cli` passes the path; `cli-passes-log-file` does.
- Convergence: first round.
---

created: 2026-10-07 01:04
---
Review round 1 on c60c994..006d861 (2026-10-07): reviewer approve with follow-ups, all three criteria met on reading, nothing blocking; five Lows on board-git-check.sh. Refuter: eight mutants, six killed; survivors are an untested git add failure (logs nothing) and the log path rule with both state variables set (binary and board.sh would disagree); it also suspects the MCP launcher never reads board.env, so hook and MCP writes could log to different files. Gates: the mechanical lane's full run was red only on mcp-task-edit-status.test.ts and focus.test.ts timeouts under load, both passing alone, in files the diff does not touch.

Decisions by the lead on the two follow-ups: (1) the auto_commit-off skip line moves to after a successful write and is logged at most once per process, naming the item; (2) on a board with auto_commit off, the kickoff git check says commits are off and does not fail on the expected uncommitted files, but still checks the lock. Fix round 1 commissioned with both, the two survivors, the board.env question and the five Lows.
---

author: @SubagentStop
created: 2026-10-07 01:20
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- `ce12ef0` "Say auto_commit is off once, after a write lands, and test the two refuter survivors". `auto_commit` is now read inside `commitBoard`, next to the other reasons not to commit. So the skip line comes only after a write that landed, names that write's item (on the MCP path too) and is logged once per process (`logCommitsOffOnce` in `board-log.ts`). `shouldAutoCommit` in `core/backlog.ts` now returns the caller's override, or true.
- New test "logs a git add failure that is not the lock, naming git add" in `claude/coder-fleet/board/src/test/board-commit-log.test.ts` (survivor 1, commit `ce12ef0`): a `chmod 000` file under `.boards` makes the add fail. Fails on the `return false;` mutant.
- New test "is the file the hook library resolves when CODER_FLEET_STATE_DIR and XDG_STATE_HOME are both set" (survivor 2, commit `ce12ef0`): compares `boardLogPath()` with the value `hooks/lib/board.sh` gives when bash sources it. Fails when XDG_STATE_HOME is made to win.
- New test "logs one line, not two, for two writes in one process, naming the first item" (commit `ce12ef0`): fails if the once-per-process guard is removed.
- New tests "logs nothing when the write itself fails" and "names the item on the MCP path" (commit `ce12ef0`): both failed on the code before the move.
- `3a53a58` "Resolve the hooks log in the board shim, so the MCP server logs where the hooks do". The refuter was right: `.mcp.json` starts `board/board.sh`, which never read `board.env`. The shim now works out `BOARD_LOG_FILE` the same way `hooks/lib/board.sh` does (defaults, then `board.env` sourced in a subshell) and exports it.
- New contract cases `mcp-shim-log-default`, `mcp-shim-log-state-dir` and `mcp-shim-log-file` in `board-hook-contract.sh` (commit `3a53a58`): all three failed before the shim change. The live case now has a comment saying `cli-passes-log-file` is what guards `board_cli`'s export.
- `d3ae20a` "Pass board-git-check on a board with commits off, and harden its fix and lock checks": with `auto_commit` not true, `scripts/board-git-check.sh` says the writes are uncommitted by design and doesn't fail on them, but still checks the lock.
- Also in `d3ae20a`: `git status` runs with `--no-optional-locks`, and a gitignored or commits-off board gets no "ok" line. The printed fix keeps `.boards/.focus` out of both the add and the commit. `kickoff.md` now says the commits-off note is not a failure.
- New contract cases in `board-git-check-contract.sh` (commit `d3ae20a`, 40 cases now): the printed fix is run on both kinds of board and must leave nothing staged. Also `status: takes no optional lock`, and `held lock: exits 0` with a stricter "held by pid <holder>".
- More new contract cases in `d3ae20a`: the pgrep path with lsof hidden, both git running and not running; five `auto_commit off` cases; and `ignored board: does not claim every write is committed`.
- Mutants I ran: the three in the binary (survivor 1, survivor 2, the once guard) and seven in `board-git-check.sh` were all killed. "Focus not excluded from the add" survived at first, so I added the nothing-staged check and it is now killed.
- `bash claude/evals/lib/check-all.sh`, run once with nothing else running: rc 0, "Every deterministic check passes", total 184.7 s. That is 4.7 s over the 180 s budget. The slowest sections were disabled-agents (184.6 s), scope-hook-contract (179.8 s) and board (173.0 s). The 15 "Is a directory" / "No such file" stderr lines appeared in the earlier run too, so they were already there.
- Also ran: `bunx tsc --noEmit` (exit 0), biome on the changed TS files, shellcheck on the changed scripts (clean), `board-hook-no-bun.sh` (holds), and the contracts that read `kickoff.md` plus `suite-coverage` (all rc 0).
---

created: 2026-10-07 01:22
---
Fix round 1 done (ce12ef0, 3a53a58, d3ae20a): both refuter survivors killed by new tests; the MCP launcher board/board.sh now resolves the log path from board.env like the hooks (the refuter's suspicion was right); the auto_commit-off skip is logged once per process after a write lands; kickoff's git check passes a commits-off board and still checks the lock; the five Lows taken. check-all.sh exit 0 alone on macOS (184.7 s). PR #81 opened, and CI on Linux failed for real: seven board-git-check lock cases (age and holder) fail on ubuntu while passing on macOS, pointing at `stat -f %m` (GNU stat reads -f as filesystem status) and the lsof form. Not merged. The coder is making the age and holder checks portable; this is the Linux half of the same fix round, not a second round.
---

author: @SubagentStop
created: 2026-10-07 01:27
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Cause: `stat -f %m` on GNU coreutils does not give the file's age. In `ubuntu:24.04` it printed the file's filesystem info and exited 1. The script then fell through to `stat -c %Y` and took both outputs together as the age. That broke the age arithmetic, so the script died before the lock checks. That is why every age and holder case failed on Linux, and why `stale lock: exits 1` only passed by accident.
- `0c57a86` "Read the index.lock age without stat, so board-git-check works on Linux": `claude/coder-fleet/scripts/board-git-check.sh` now reads the lock's age with python3 `os.path.getmtime`, then `date -r FILE`. If neither gives a number, it says the age could not be read and shows the `rm` fix, rather than guessing. `lsof -t` is now called without `--`; the path is absolute, so it can't be mistaken for an option.
- New contract cases in `claude/evals/lib/board-git-check-contract.sh` (commit `0c57a86`), each with a fake GNU-style `stat` first on PATH: "GNU stat on PATH: an old unheld lock is still stale", "and gives the fix", "a young lock is still young", "and exits 0". On macOS they fail 4 of 44 against the CI head's script and pass 44 of 44 on the fix, so CI-only breakage of this kind now shows up on a Mac.
- `c636d41`: the fake `stat` now behaves like the real coreutils one I saw in the container (filesystem info on stdout, exit 1), and the comment says so.
- Ran in a local Linux container: I started Docker Desktop with `open -a Docker`, which brought the daemon up (29.8.0). I ran `ubuntu:24.04` with git, python3, lsof 4.95.0 and procps installed, and ran the contract as a non-root user.
- Linux result for CI head 2a59648's script with its own contract: 30 passed, 7 failed. The same seven cases CI named, and the pgrep case was skipped the same way.
- Linux result for the CI head's script with the new contract: 30 passed, 11 failed (those seven plus the four GNU-stat cases).
- Linux result for the fixed script: 41 passed, 0 failed. The three pgrep cases were skipped because lsof is in `/usr/bin` there.
- Also ran: the contract on macOS under `/bin/bash` (44 passed, 0 failed) and shellcheck on both files (clean). I did not run `check-all.sh` again; this round changed only these two files.
---

created: 2026-10-07 01:29
---
Sub-issue 1 of 1: merged to main in PR #81, released as v0.39.4 (tag on c636d41, the head CI proved). Done still needs: nothing.

Done: once you rerun claude/scripts/install-home.sh to rebuild ~/.local/bin/board, a board write whose commit fails or is skipped leaves a `commit failed` or `commit skipped` line in hooks.log, from the hooks and the board MCP server alike, and /kickoff reports uncommitted board files and a stale index.lock without deleting either.

Evidence: 1, board-commit-log.test.ts (git add and commit refusals, a held lock, the MCP writer, the log path matching board.sh) and the contract cases cli-passes-log-file, live-commit-failed-logged, mcp-shim-log-default, mcp-shim-log-state-dir and mcp-shim-log-file; 2, board-git-check.sh run from kickoff's Board check, board-git-check-contract.sh 44 of 44 on macOS and 41 of 41 in an ubuntu:24.04 container; 3, board-commit-log.test.ts skip cases. CI SUCCESS on c636d41 after a first Linux run failed on GNU stat; check-all.sh exit 0 alone on macOS.

Definition of Done: 1 as above. 2 reviewer approved; refuter round run, its two survivors and the MCP board.env gap fixed in fix round 1, which also took the Linux portability fix CI exposed. 3, 5, 6 not applicable. 4 v0.39.4 tagged and pushed.

Not done: the new behaviour needs the rebuilt binary; the pgrep fallback is tested only on macOS.
---
<!-- COMMENTS:END -->
