---
id: CF-127
title: Give review-round's fix lane its own worktree cut from local HEAD
status: Done
assignee: []
created_date: '2026-10-04 21:44'
updated_date: '2026-10-06 04:50'
labels: []
dependencies: []
references:
  - claude/coder-fleet/workflows/review-round.js
  - docs/limits.md
priority: High
type: bug
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human ordered this on 2026-10-05, choosing to fix review-round before closing CF-52 #3. The CF-52 #3 live run (review-round wf_1297e8b7-cb8 with fix: true on CF-53) showed that a workflow `agent({agentType: 'coder-fleet:coder'})` spawn gets no worktree isolation: the fix-lane coder started in the main checkout (`git rev-parse --git-dir` = `.git`), and only the coder's own scope guard stopped it writing to main. Workflow spawns don't receive the type's `isolation: worktree`, so review-round has to create the worktree itself. CF-52 #3 is re-run as the proof once this lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Before review-round's fix lane spawns its coder, a git lane creates a linked worktree under .claude/worktrees/ on a new branch at the pinned head commit, and the coder's prompt tells it to work only there; the coder is never started with the main checkout as its only place to work
- [x] #2 The fix lane verifies from git that the coder's commit is on that worktree's branch, as today's git-state check does, and a coder that reports the main checkout stops the run as now
- [x] #3 workflow-logic.mjs covers: the worktree lane runs before the coder, the coder prompt names the worktree path, and a failed worktree creation stops the run without spawning a coder
- [x] #4 docs/limits.md and hooks README item 18 state that workflow-spawned agents get no harness isolation and how review-round compensates
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
author: @SubagentStop
created: 2026-10-05 03:33
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- `board/src/server/index.ts:409-410` - port precedence: `// The argument, then the config's default_port, then a random free port.` then `const finalPort = port ?? config?.defaultPort ?? 0;`
- `board/src/server/index.ts:397` - signature: `async start(port?: number, _openBrowser = true, options: { host?: string; quiet?: boolean } = {})`
- `board/src/mcp/server.ts:135-147` - `startWebUi` calls `await ui.start(0, false, { quiet: true });`. Port `0` is passed explicitly, so `??` does not fall through to `defaultPort`.
- `board/src/mcp/tools/serve/index.ts:23-30` - `board_serve`: description "on a random loopback port", empty input schema, calls `server.startWebUi()`.
- `commands/board.md:6` - "binds `127.0.0.1` on a port the kernel picks". Its last paragraph names `board serve --host <interface> --port <n>` as the human's override outside a session.
- `board/board.sh:7-11` - only resolves the binary (`~/.local/bin/board`, then `bin/board`, then `bun src/cli.ts`). It has no port logic. `.mcp.json` runs `board.sh` with `"args": ["mcp"]`.
- `board/src/constants/index.ts:76` - `defaultPort: 6420,` in the init defaults. `board/src/test/test-utils.ts:301` reads it as `defaultPort: DEFAULT_INIT_CONFIG.defaultPort`.
- `board/src/constants/index.ts:36,40` - `CONFIG: "config.yml"` and `ROOT_CONFIG: "backlog.config.yml"`. The board reads `.boards/config.yml`.
- `/Users/alex/Dev/Work/extensions/coder-fleet/.boards/config.yml` - has no `default_port`. Keys set: `project_name`, `task_prefix`, `statuses`, `default_status`, `labels`, `priorities`, `definition_of_done`, `require_acceptance_criteria`, `auto_commit`.
- `board/src/file-system/operations.ts:2111,2164-2165` - the parser is hand-written and splits lines on the first `:`. The port case is `case "default_port":` then `config.defaultPort = Number.parseInt(value, 10);`. Write-back is at `:2224` and `:2267`.
- `board/src/types/index.ts:352` - `defaultPort?: number;`
- `board/src/core/content-store.ts:77,121` - `INTEGER_CONFIG_KEYS = new Set(["max_column_width", "default_port", "zero_padded_ids", "active_branch_days"])` and `if (key === "default_port" && (number < 1 || number > 65_535)) return false;`. The recognised key list is at lines 70-100.
- `board/src/server/index.ts:1529` - the settings endpoint also validates: `if (updatedConfig.defaultPort && (updatedConfig.defaultPort < 1 || updatedConfig.defaultPort > 65535))`.
- `.claude/coder-fleet.json` is read by the hooks and scripts, not the board binary: `hooks/lib/fleet-config.sh`, `hooks/lib/fleet-config.py`, `hooks/hooks.json`, `hooks/enforce-disabled-agents.sh`, `scripts/fleet-agents.sh`, `workflows/review-round.js`.
- `board/src/cli.ts:306-316` - `serve` command: `.option("--port <n>", "port; else CODER_FLEET_BOARD_PORT, else default_port in config, else random")`, `.option("--host <h>", ... CODER_FLEET_BOARD_HOST ...)`, `const portArg = o.port ?? process.env.CODER_FLEET_BOARD_PORT;`.
- `skills/board-conventions/SKILL.md:142` documents the same precedence. The `mcp` command reads neither the flag nor the env var.
- `board/src/test/mcp-serve.test.ts:69` - "board_serve starts the web UI on a random loopback port and returns its URL". The file also covers idempotence and `board_stop` cases (a) to (h).
- `board/src/test/serve-board.test.ts:53` - `describe("board serve on a random port"`. It uses `unusedLoopbackPort()` from `board/src/test/test-ports.ts:4`.
- `board/src/test/server-port.test.ts` covers `isPortAvailable` and `findNextAvailablePort`. `board/src/test/server-hostname.test.ts` covers the host. Neither is in `BOARD_TESTS`.
- Config tests: `board/src/test/dod-defaults-config.test.ts`, `cli-dod-config.test.ts`, `require-acceptance-criteria.test.ts`, `task-type-config.test.ts`, `prefix-config.test.ts`. The first three are in `BOARD_TESTS`.
- `claude/evals/lib/check-all.sh:113-165` runs `bunx tsc --noEmit`, then `bun build --target=bun src/cli.ts --outdir "$BOARD_TMP"`, then `bun test --timeout=10000 "${BOARD_TESTS[@]}"`. `CHECK_ALL_BOARD_FULL=1` runs the whole `bun test` suite. The step is skipped when bun is absent.
- No test sets `CODER_FLEET_BOARD_PORT`, `--port` or `default_port` and checks the bound port. I grepped `cli-board.test.ts`, `cli-board-behaviour.test.ts` and `serve-board.test.ts` for these and found nothing.
- Runtime: TypeScript on Bun, `board/package.json` has `"type": "module"` and `"module": "src/cli.ts"`. Scripts: `"test": "bun test --timeout=10000"`, `"check:types": "bunx tsc --noEmit"`, `"check": "biome check ."`, `"build": "./build.sh"`.
- `board/build.sh:12-14` - `bun install --frozen-lockfile`, then `bun scripts/build.ts`. Output is `bin/board`. The installed binary at `~/.local/bin/board` comes from `claude/scripts/install-home.sh`.
---

created: 2026-10-05 07:05
---
2026-10-05, the human, in the session: "go ahead with #56 and CF-127". This repeats an order not yet delivered: CF-127 was ordered this morning and is already High. Taken ahead of the next spawn on any other item; CF-128's second review round moves back behind it, and its running fix-round coder is left alone.

Comment #1 above (the @SubagentStop scout handoff about the board port) is mis-bound. It belongs to CF-128. It landed here because this checkout's focus was still CF-127 from the earlier session when the lead sent that scout. Ignore it for CF-127.

Sub-issue 1 of 1: started again. Done still needs: criteria 1-4. Done: nothing on the branch. The coder spawned at 08:19 died with no handoff while the human was offline, leaving cf-127-fix-lane-worktree at fc5bd80 with no commits of its own. Not done: review-round's fix lane still spawns its coder with no worktree, so a fix-round coder can start in the main checkout. A fresh coder is starting from main at 275941c (v0.31.0), targeting v0.32.0.
---

created: 2026-10-05 07:06
---
Correction to comment #2: not nothing. The dead coder left 290 uncommitted lines in its worktree (agent-ab1c0c5a986ec8cc2): review-round.js +137/-? and workflow-logic.mjs +193/-?. They cover FIX_WORKTREE_SCHEMA, fixWorktreeFor (named `review-round/<issue>-r<n>`; an existing branch stops the run and is never reused), worktreeLaneStop (fails closed on created, path, branch, head and linked gitDir), the git lane that runs `worktree add` before commissionFixes, and offTheFixWorktree in the fix gate. The lead saved them as WIP commit fd58bfb on cf-127-fix-lane-worktree: unreviewed and untested. A fresh coder continues from it on cf-127-fix-1, rebased onto main at 275941c (#56 touched neither file).
---

author: @SubagentStop
created: 2026-10-05 09:50
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- What changed: a `review-round` run with `fix: true` now cuts the fix-lane coder's worktree before spawning the coder, and stops with no coder spawned if git can't confirm it. PR #58 against main from `cf-127-fix-1` (pushed), branch rebased onto origin/main 275941c.
- Commits: f0e7e0d (the lead's WIP, rebased from fd58bfb, message unchanged); dc78382 "review-round: name the fix worktrees left behind in nextStep (CF-127)"; 7b9ccba "workflow-logic: worktree-per-round fails by name, not by crash, on a script that cut nothing (CF-127)"; 1fb6524 "workflow-logic: each worktree-lane failure row breaks one thing (CF-127)"; c08ac9a "Document that workflow spawns get no isolation, and how review-round compensates (CF-127)"; ab31088 "v0.32.0: review-round's fix lane cuts its own worktree before the coder starts (CF-127)"; aebd3b6 "limits: keep the pending-run sentence the worktree-base contract pins (CF-127)".
- WIP: I read every hunk in both files. It does not have the CF-24.4 problem: both files parse, and no prose line runs as code. `commissionFixes` already puts the worktree path and branch in the coder's prompt, and `fixWorktrees` was already in the result.
- Changed in the WIP's code: `WORKTREE_NOTE` was built but never appended to `nextStep`, so two of its own tests failed. Fixed in dc78382.
- Changed in the WIP's tests: the `worktree-per-round` stub threw on the pre-WIP code and aborted every test after it; it now falls back so the test fails by name (7b9ccba). The failure table had no `gitDir` in most rows, so the linked-worktree check stopped every row and two mutants survived. The rows now each break one thing, with three new rows and a control (1fb6524).
- Criterion 1: in `claude/coder-fleet/workflows/review-round.js`, the `fix worktree` git lane runs `worktree add` at the pinned head before `commissionFixes`, and the coder prompt names the worktree and branch. Proved by `worktree-lane-before-coder`, `worktree-cut-at-pinned-head`, `coder-prompt-names-worktree`, `coder-prompt-names-branch` and `worktree-good-cut-spawns-coder`.
- Criterion 2: `offTheFixWorktree` checks the path and branch git reports in the verify lane, on top of `gateFix`, and the existing main-checkout stop tests still pass. Proved by `fix-off-the-worktree-stops:*`, `fix-off-the-worktree-not-re-reviewed:*` and `verify-told-the-worktree`.
- Criterion 3: tests are in `claude/evals/lib/workflow-logic.mjs`. Lane before the coder and prompt naming the path are as in criterion 1. Failed creation spawning no coder: `worktree-failure-no-coder:*` (12 rows), `worktree-failure-stops:*`, `worktree-failure-carries-why:*`, `no-main-checkout-no-coder` and `branch-exists-next-step`. Also `worktree-per-round`, `worktree-in-the-result`, `worktree-left-for-the-lead` and `worktree-named-on-a-stop`.
- Criterion 4: `docs/limits.md` (the "Worktree isolation for a workflow-spawned `coder`" entry, the `fix: true` entry and the agentType-less-lane entry) and `claude/coder-fleet/hooks/README.md` item 18.
- Failing-first proof: against fc5bd80's `review-round.js` (identical to main's), workflow-logic gives 399 passed, 51 failed, and every new CF-127 test fails.
- Mutants: 16 run, all killed in the end. The first batch of 10 had two survivors (deleting the `created` check, deleting the `head` check), both masked by the missing `gitDir`. After 1fb6524, those two plus four new single-check mutants (sha shape, path, branch, `created` read as truthy) were all killed.
- `node claude/evals/lib/workflow-logic.mjs`: 450 passed, 0 failed after dc78382; 457 passed, 0 failed after 1fb6524.
- check-all run 1: `bash claude/evals/lib/check-all.sh` was killed with exit 137 when the session dropped.
- check-all run 2, on ab31088: exit 1, with `worktree-base` FAILED. My limits rewrite had dropped "Until that run is recorded here, the entry stays", which that contract pins, and the CF-52 run is still pending, so I restored the sentence. `worktree-base-contract.sh` alone then gave 27 passed, 0 failed.
- check-all run 3, on aebd3b6: "Every deterministic check passes", exit 0. That is three runs against the brief's one, for the reasons in runs 1 and 2.
---

created: 2026-10-05 09:50
---
Sub-issue 1 of 1: built, in review as PR #58 (cf-127-fix-1 at aebd3b6, v0.32.0, rebased on 275941c). Done still needs: criteria 1-4 proven on main, DoD 2 (review plus refuter, since this item is High), DoD 4, and the CF-52 #3 live re-run as proof.

Done, on the coder's word: review-round with fix: true runs a `fix worktree` git lane that cuts `.claude/worktrees/review-round-<issue>-r<n>` on `review-round/<issue>-r<n>` at the pinned head before spawning the coder, and names both in the coder's prompt. If git can't confirm the worktree (not created, wrong path or branch, wrong head, not linked), the run stops and no coder is spawned. A fix commit off that worktree or branch is refused. The coder read every WIP hunk and found it parses cleanly; it fixed WORKTREE_NOTE (built but never added to nextStep), a test stub that crashed the suite on pre-WIP code, and failure rows that masked two mutants. workflow-logic is 457/0, it was seen failing first (399/51 on fc5bd80's review-round.js), and 16 mutants were all killed. The coder's check-all was exit 0 on aebd3b6 after one red run on worktree-base, caused by a pinned limits sentence it had dropped and then restored.

Not done: not reviewed, refuted or merged, so a review-round fix lane can still start its coder in the main checkout. Nothing has run live: whether a real lane runs `worktree add` as told, and whether a coder whose cwd is the main checkout keeps to the worktree, are proven only by the CF-52 #3 re-run after merge.
---

author: @SubagentStop
created: 2026-10-05 10:21
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- **Range covered:** the range includes two issues, both attacked: CF-24.4 (the card gate in `TaskCompleted`, via PR #56) and CF-127 (`review-round` cutting its own fix worktree). The budget was eight mutants, most damaging first, all eight run in parallel in their own copies at `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/d89f476a-b41b-45a0-a8e0-dd697a851b72/scratchpad/refuter-1791195009/m1..m8`, applied with `mut.py` (exact single-match replace).
- **Baselines:** the full gates ran once: all steps passed except `task-tools`, which failed 2 of 20 only because the scratch tree has no git. Per-suite: workflow-logic 457/0 in 11 s, board-hook-contract 204/0 in 77 s, both exit 0.
- **M1, killed (exit 1, 2 failed):** in `hooks/lib/board.sh` I dropped Definition of Done items from `open_count` (`[.task.acceptanceCriteria[] | select(.checked != true)]`). Killed by `cg-unticked-dod` and `cg-dod-checked-yes-is-unticked`.
- **M2, killed (exit 1, 2 failed):** in `hooks/board-task-completed.sh` I removed `[ "$BOARD_ITEM_AC_COUNT" -gt 0 ] &&`, so a card with no criteria could pass. Killed by `cg-no-criteria` and `cg-no-criteria-no-tick-advice`.
- **M3, killed (exit 1, 7 failed):** in `hooks/board-task-completed.sh` I changed the strict could-not-read branch to `elif false; then`. Killed by `cg-unreadable-strict`, `cg-unreadable-shape-strict` and five others.
- **M4, killed (exit 1, 6 failed):** in `workflows/review-round.js` `worktreeLaneStop` I replaced the `/worktrees/` gitDir check with `if (false)`. Killed by the `worktree-failure-*:not-linked` and `:no-git-dir` rows.
- **M5, killed (exit 1, 3 failed):** in `worktreeLaneStop` I dropped `|| !sameCommit(w.head, head)`. Killed by the `worktree-failure-*:other-head` rows.
- **M6, killed (exit 1, 4 failed):** in `offTheFixWorktree` I disabled the branch check with `if (false)`. Killed by the `fix-off-the-worktree-*:another-branch` and `:no-branch` rows.
- **M8, killed (exit 1, 16 failed):** in `fixWorktreeFor` I made `const name = id`, dropping the `-r<n>` round suffix. Killed by `fix-recorded` and 15 others.
- **M7, equivalent (exit 0, 457/0):** in `sameBranch` I dropped `Boolean(strip(a)) &&`. Its only two callers (`review-round.js:689` and `:1081`) always pass a non-empty `review-round/<id>-r<n>` as the second argument, so an empty first argument can never equal it. No test could kill it, and none should be written for it.
- **Claims vs diff:** the `docs/limits.md` entry matches the diff. The lane stops on path, branch, head and gitDir; a branch that already exists is a stop, never a reason to pick another name; `fixWorktrees` is returned; and `offTheFixWorktree` is applied on both the blocker path and the refusal path.
---

created: 2026-10-05 10:24
---
Sub-issue 1 of 1: merged to main at 44727c8 (PR #58, v0.32.0). Done still needs: DoD 4 (tag v0.32.0) and the CF-52 #3 live re-run, which the card names as the proof.

Done: on main, review-round with fix: true cuts `.claude/worktrees/review-round-<issue>-r<n>` on `review-round/<issue>-r<n>` at the pinned head before spawning the fix-lane coder, names both in the coder's prompt, and stops with no coder spawned when git can't confirm that worktree. A fix commit made off that worktree or branch is refused.

Review round 1 (wf_8ce488df-b43): approve with follow-ups, 0 blocking. Refuter: baseline ran the full gates, 8 mutants, 7 killed (worktreeLaneStop's gitDir and head checks, offTheFixWorktree's branch check, the -r<n> suffix, and three CF-24.4 card-gate mutants), and 1 equivalent (sameBranch's empty guard; every caller passes a non-empty branch). Two independent lanes ran check-all at aebd3b6, both exit 0 with versions 0.32.0; CI `deterministic` was green.

Ticks, by the lead, on evidence now on main. Criterion #1: workflow-logic `worktree-lane-before-coder`, `worktree-cut-at-pinned-head`, `coder-prompt-names-worktree`/`-branch`. #2: `fix-off-the-worktree-stops:*`, `verify-told-the-worktree`, and refuter M6 killed. #3: `worktree-failure-no-coder:*` (12 rows plus control) and `no-main-checkout-no-coder`; failing first at 399/51 on the old review-round.js. #4: docs/limits.md and hooks/README.md item 18 (c08ac9a, aebd3b6). DoD #1 as above; #2 reviewer approve plus the refuter round (High); #3 not applicable: no agent body or skill frontmatter changed; #5 not applicable: opencode/coder-fleet has no review-round or fix lane; #6 not applicable: no spec.

Not done: v0.32.0 is not tagged. Nothing has run live. CF-134 (filed today) may make a fix-lane coder stop at coder.md:19's main-checkout check during the CF-52 #3 re-run. Two lows dropped as no fix round ran: the gitDir `/worktrees/` check passes trivially for any git dir under the cut path (review-round.js:691), and the `fix worktree not created` next step blames an earlier run even when this run's lane failed a later check (review-round.js:1760).
---

created: 2026-10-05 12:09
---
Sub-issue 1 of 1: released. v0.32.0 was tagged by the human on 44727c8 and pushed 2026-10-05, verified with ls-remote. DoD #4 is ticked, so every criterion and DoD item is ticked. Done: released, review-round's fix lane cuts its own worktree before its coder starts. Not done here, tracked elsewhere: the CF-52 #3 live re-run is the proof the card's description names, and it belongs to CF-52. CF-134 should land before it, or the coder.md:19 main-checkout check may stop the fix-lane coder.
---
<!-- COMMENTS:END -->
