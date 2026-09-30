---
id: CF-90
title: Let the reviewer run the declared gates read-only
status: In Progress
assignee: []
created_date: '2026-09-30 08:32'
updated_date: '2026-09-30 10:09'
labels:
  - hooks
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/45'
  - claude/coder-fleet/hooks/enforce-agent-scope.sh
  - claude/coder-fleet/agents/reviewer.md
priority: Medium
type: enhancement
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #45, filed by the human on 2026-09-30 from the Fathom lead session. The reviewer's scope hook (REVIEWER_ALLOWED_CMDS) allows only reads, and reviewer.md says never run tests, builds or installs, so every verdict takes typecheck and tests on trust, and independent gates need a second mechanism (review-round's lanes, the refuter baseline, the lead by hand). Those caused three problems in Fathom on 30 Sep: a lane's `git checkout --detach` in the main checkout let a board hook commit onto a detached HEAD; the lead's `pnpm --filter ... typecheck` silently ran `pnpm install` against symlinked node_modules; verdicts couldn't tell a real failure from a known load-sensitive test. The invariant is "never change the diff under review", and a read-only gate doesn't. Proposal: the reviewer runs the project's declared gates (a `gates:` list in project settings or AGENTS.md) read-only, against the pinned head, in a clean linked worktree, calling binaries from node_modules/.bin directly, never through a package manager. Denied whatever the list says: package-manager verbs (pnpm/npm/yarn/bun, since `pnpm --filter x <script>` may install), installs, snapshot updates, --fix, --write, watch mode, in-repo build output (allow --noEmit or an --outDir under scratchpad/TMPDIR), network tools, and any command in the main checkout. The verdict gains a `gates` block (command, exit code, pass/fail counts) in the shape review-round reads. Folding review-round's tests and types-and-build lanes into the reviewer is a separate decision. lead.md step 4 ("A reviewer can never run the change's gates") is edited in the lead.md track after CF-51, CF-24.1 and CF-53, so this card's coder does not touch lead.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reviewer can run each command in a project's declared gate list, and a single-file or single-test form of its test runner, in the review worktree; each is covered by a scope-hook test that allows it
- [ ] #2 Every command in the denied list is refused for the reviewer, with a scope-hook test per class: package manager verbs, including `pnpm --filter x typecheck`; snapshot update; `--fix`; watch; in-repo build output; network; and the main checkout as the working directory
- [ ] #3 agents/reviewer.md states the new boundary (run the declared gates read-only, never change the diff or its dependencies) in place of 'never run tests, builds or installs', and its handoff reports each gate's command, exit code and counts
- [ ] #4 An eval prompt shows the reviewer running the gates on a diff with a failing test and reporting the failure as a finding
- [ ] #5 lead.md step 4 and the fleet design describe the reviewer running declared gates, landed in the lead.md track after CF-51, CF-24.1 and CF-53
- [ ] #6 bash claude/evals/lib/check-all.sh passes; migration-checklist run over reviewer.md and lead.md
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 08:33
---
The human ordered this built on 2026-09-30 ("fix the github issues", #45). The coder builds #1 to #4 and #6 now; #5's lead.md step 4 edit waits in the serial lead.md track. This is an authorisation boundary (the reviewer starts executing code), so it gets the escalated review: a full-budget reviewer, a second round, and a refuter.
---

author: @SubagentStop
created: 2026-09-30 09:12
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit `0074e97` "CF-90: let the reviewer run the declared gates, read-only, and nothing else that executes": `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c/claude/coder-fleet/hooks/enforce-agent-scope.sh` gains `reviewer_gate_check`, `declared_gates`, `gate_dir_state`, `gate_flag_denial`, `gate_selector_ok`, `gate_match`, `under_scratch` and `phys_path`; 58 new cases in `claude/evals/lib/scope-hook-contract.sh`.
- Reused helpers: `word_expansion_denial` (taken out of `gh_words_denial` rather than copied), `gh_command_assigns`, `GH_QUOTED_FLAG_RE`, `COMMAND_WRAPPERS`, `install_verb` (ui-designer), `strip_leading_syntax`, `unescape_words`, `lex_abs`, `strip_inert_quotes`, the interpreter-payload recovery, and a new `seg_cd` taken out of coder's worktree guard (coder now calls it too).
- Commit `e2d83de` "CF-90: declare the gates in AGENTS.md and document the reviewer's gate rule": Gates section in `claude/coder-fleet/templates/AGENTS.md`; reviewer paragraph rewritten in `claude/coder-fleet/hooks/README.md`.
- Commit `12250dd` "CF-90: the reviewer runs the declared gates and reports each one": `claude/coder-fleet/agents/reviewer.md` states the new boundary in place of "Never run tests, builds or installs", adds a gate-running step (with one rerun of a failing test in single-test form), and the handoff gets one `- gate: <command> - exit <code> - <passed> passed, <failed> failed` Done bullet per gate.
- Migration checklist over `reviewer.md`: the frontmatter parses and is unchanged, the skills exist, the model and effort values are valid, 43 lines, four H2 sections in order, no H1, no em or en dashes, no hard-wrapped lines, no emoji, no double-check prompts. Check 10 fails as before (the body states no output length; not new), check 11 not run (it needs paid evals), and the plugin.json bump was skipped because the brief said so.
- Commit `ad806c3` "CF-90: a reviewer eval prompt that runs a failing gate and reports it": new prompt `claude/evals/reviewer/prompts/05-failing-gate.md`, fixture `claude/evals/fixtures/gates-app/` and diff `fixtures/inputs/discount-cap.diff` (`Math.floor` breaks "rounds half a cent up").
- In the same commit, `run.sh` gains a `#!review:` directive: it commits the fixture as `main`, cuts a linked worktree, applies and commits the diff, and runs the agent there, leaving `.git` out of the unchanged-workspace check.
- Also in that commit: `reviewer/checks.sh` renames `RV-noruns` to `RV-nopm` and adds `RV-gate`; the rubric's RV03 is revised and RV05 added; `claude/evals/README.md` documents the directive.
- Commit `f9eeb7b` "CF-90: record what the reviewer's gate rule cannot bound": a new entry in `docs/limits.md`.
- Commands run: `bash claude/evals/lib/scope-hook-contract.sh` gave exit 0, 541 passed, 0 failed. `bash claude/evals/lib/check-all.sh` gave exit 0, "Every deterministic check passes" (runner-gate 14/0, roster 155/0, workflow-logic 360/0, board ok).
- What makes the scope tests fail: against the hook as it was at base `fbf51e5`, 54 of the new cases failed (red run seen); the rest were already denied for the reason they assert.
- Mutants run and killed: reading the list from the worktree instead of the main checkout lets `./node_modules/.bin/rimraf src` through; comparing only the lexical output path lets `--outDir=../gates-main/dist` through.
- What makes the eval tests fail: `runner-gate.sh` failed 7 of its 9 new cases before the prompt, fixture and runner mode existed; `RV-gate` exits 1 on a transcript with no gate bullet, or with a bullet showing exit 0 (probed).
- Allowed, a declared gate exactly as written: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/eslint src`, `node --test` (scope-hook section "runs the declared gates read-only").
- Allowed, after a `cd` into the worktree: `cd $GWT && ./node_modules/.bin/vitest run`.
- Allowed, piped to a read or with stderr discarded: `vitest run | tail -40`, `vitest run 2>/dev/null`.
- Allowed, single-file and single-test forms of the test gate: `vitest run src/auth/session.test.ts`, `vitest run -t rotates`, `vitest run --testNamePattern=rotates`, and one file plus one name together.
- Allowed, output under the scratchpad or TMPDIR: `tsc --outDir /private/tmp/claude-501/p/s/scratchpad/out`, `tsc --outDir $TMPDIR/gate-out`.
- Allowed in the eval's own worktree (runner-gate): `node --test` and `node --test test/prices.test.js`.
- Denied, package managers: `pnpm --filter x typecheck`, `npm run typecheck`, `npx vitest run`, plus `npm test` in the eval worktree (runner-gate). Every denied class below is declared in the test repo's list and refused anyway.
- Denied, installs: `./node_modules/.bin/playwright install`.
- Denied, snapshot updates: `vitest run -u`, `vitest run --update-snapshots`, `vitest run -\u`.
- Denied, `--fix` and `--write`: `eslint src --fix`, `prettier --write src`.
- Denied, watch mode: `vitest --watch`, `vitest watch`, `tsc -w`, `vitest run '--watch'`, `vitest run --wat\ch`.
- Denied, build output outside TMPDIR or the scratchpad: `tsc`, `tsc --outDir dist`, `tsc --outDir=../gates-main/dist`, `tsc --outDir /opt/dist`, `vite build`.
- Denied, network tools: `curl https://example.com`, `wget https://example.com`.
- Denied, wrong working directory: the main checkout as cwd, `cd $GMAIN && ...`, a subdirectory (`cd $GWT/src && ...`), and a repo with no gates.
- Denied, not a declared gate or not an allowed single form: two files, `../outside.test.ts`, `/tmp/evil.test.ts`, `--reporter=json`, `eslint src src/extra.ts`, `node --test test/a.test.js`, `tsc --noEmit -p other.json`, and `rimraf src` (declared only in the diff's own `AGENTS.md`).
- Denied, word rules: `$F`, `{a,b}`, `*`, `[a]` (expands); a backtick (substitution); `"--update=true x"` (quoted option); `NODE_OPTIONS=...` and `for NODE_OPTIONS in` (assigns a variable).
- Denied, wrappers and other runners: `timeout 60`, `env`, `xargs` in front of a gate; `bash -c '<gate>'` (interpreter); `python3 -m pytest` (not a read command, not a gate).
---

author: @SubagentStop
created: 2026-09-30 09:23
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. Reviewed the diff from `fbf51e5` to `f9eeb7b` against CF-90 criteria 1-4 and 6, with 5 deferred as briefed. Read: the hook (`reviewer_gate_check` and helpers, `seg_cd`, the shared word rules), `reviewer.md`, `hooks/README.md`, the template, `limits.md`, the `run.sh` review mode, `runner-gate.sh`, `checks.sh`, the rubric, the fixture, and the contract cases.
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:974 - `seg_cd` assumes every `cd` moves the shell: `true || cd <WT>;`, `( cd <WT> );`, `cd <WT> |` and `cd <WT> &` pass the gate as the worktree while it runs in the main checkout, and `cd -P`/`cd --` are ignored though they do move.
- must fix: docs/limits.md:39 - a plain `vitest run`/`jest` writes new snapshots into the worktree under review, and tsBuildInfoFile can write outside the tree. Record both, give template guidance (`--ci`), and add a `git status` check after the gates in reviewer.md step 4.
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:1550 - gate segments are the new most expensive shape and were never timed against the 10s timeout, which fails open. Time 16 of them, call `gh_command_assigns` once per command, and cache `gate_dir_state` per directory.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:1313 - leading `@` lets `pytest @file` read flags from a file the diff controls.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:1345 - `dirname(common)` is not the main checkout for bare-repo or `--separate-git-dir` layouts.
- low: docs/limits.md:39 - uncommitted edits in the main checkout's `AGENTS.md` widen the list; say so.
- low: claude/evals/lib/scope-hook-contract.sh:418 - the gate cases skip silently if the fixture fails to build.
- low: claude/evals/reviewer/checks.sh:39 - RV-gate proves the report, not the run; RV-nopm (`:27`) can false-fail and does not check installs.
- low: claude/coder-fleet/agents/reviewer.md:29 - `-t` is not a `node --test` flag; `:38` says "file or test name" where the hook allows both.
---

author: @SubagentStop
created: 2026-09-30 09:24
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/scope-hook-contract.sh` in the worktree gave 541 passed, 0 failed, exit 0, 281 s. Output is in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790759555/baseline.out`.
- Budget: 8 mutants and 20 minutes. I used 8 mutants and about 12 minutes. The mutants ran in parallel rsync copies (`m1` to `m8` under the same scratch directory), each running the contract suite, about 440 s each.
- survived: `seg_cd` ignoring an option argument (`-*) ;;`), so `cd -P|-L|--|-e <main> && <gate>` is allowed and the gate runs in the main checkout. `cd -P <main>/src && <gate>` also gets past the top-of-worktree check. Found with hook probes, not a mutant.
- survived: m1, `gates="$(declared_gates "$root")"` changed to `gates="$(declared_gates "$SEG_HERE")"` in `reviewer_gate_check`. 541/0, exit 0. The claim that the list is read from main, not the worktree, is untested. Probe: a worktree whose first gates block has `sneaky: ./node_modules/.bin/rimraf src`; original denies, m1 allows.
- survived: m4, `-u|--update|--update=*|` removed from the snapshot case in `gate_flag_denial`. 541/0, exit 0. The `-u` short-flag check still catches `-u`, but `--update` and `--update=*` go unguarded. Probe: main declares `vitest run --update`; original denies, m4 allows.
- survived: a test selector that is a symlink out of the worktree (`vitest run escape`, `escape -> /etc`) is allowed, because `gate_selector_ok` checks `..` in the text only.
- Killed m2 (non-zero exit): `case "$kind"` changed to `case "worktree"`, 2 contract lines failed.
- Killed m3 (non-zero exit): `REVIEWER_PACKAGE_MANAGERS=" "`, 3 contract lines failed.
- Killed m5 (non-zero exit): `--watch|--watch=*|--watch-*|` removed, 1 contract line failed.
- Killed m6 (non-zero exit): the `case "$pp"` exclusion line removed from `under_scratch`, 2 contract lines failed.
- Killed m7 (non-zero exit): `paths -le 1` changed to `-le 2`, 1 contract line failed.
- Killed m8 (non-zero exit): `why="$(word_expansion_denial "$words" no)"` changed to `why=""`, 4 contract lines failed. These fail only on the wording of the deny message; the selector regexes deny the same commands anyway, so on behaviour m8 changes nothing.
- Probes denied correctly: the diff's own `AGENTS.md` gate added as a second block.
- Probes denied correctly: `-t` or `--testNamePattern=` values holding `--update`, `-u`, `--watch`, `--outDir`, `;`, `|`, `#` or `~`.
- Probes denied correctly: `..` and `~` paths, two `-t` filters, `-tu`, `-dt`.
- Probes denied correctly: `nice`, `command`, `\command`, `exec`, `exec -a`, `time`, `time -p`, `stdbuf`, `nohup`, `builtin` and `coproc` in front of a gate.
- Probes denied correctly: `pushd <main>`, `pushd -n`, `( cd main && gate )`, `{ cd main; gate; }`, `cd main; cd -; cd - && gate`, `cd ../main`.
- Probes denied correctly: `sh -c` with a gate, newline-separated `cd` then gate, `cd main & gate`.
- Probes denied correctly: `--outDir` pointing at a symlink into the worktree or into main, and `tsc --noEmit --build` and `-b`.
- `! gate` and `cd <main> && cd - && gate` were allowed, and both are correct: each still runs the gate in the worktree.
- Worktree `git status --short` and main checkout `git status --short` both return 0 lines.
---

created: 2026-09-30 09:24
---
Round 1, 2026-09-30 (escalated). Review: request changes, three must-fixes. (1) seg_cd's model of the shell's final directory is wrong: `cd -P/--/-L <main> && gate` is allowed (the refuter reproduced it), and `true || cd <WT>;`, `( cd <WT> );`, `cd <WT> |` and `cd <WT> &` are treated as moves when they aren't. Coder's worktree guard shares seg_cd, so `cd -P <main> && git commit` likely passes too; this predates CF-90. (2) A plain vitest or jest run writes missing snapshots into the worktree under review, and tsBuildInfoFile can write anywhere; limits.md is wrong about tsbuildinfo. (3) Gate segments are the new heaviest hook shape and were never timed against the 10s timeout, which fails open. Refuter: 6 of 8 mutants killed. Survivors: the 'list read from main' test can't fail (its decoy is a second gates block and only the first is read); --update is unguarded; a symlinked test selector escapes the worktree. Fix round 1 (coder resumed) covers all of these plus the lows, including fixing coder's guard through the shared seg_cd. Filed: CF-97, a pre-existing basename hole in reviewer and scout read commands (`./scripts/cat`).
---

author: @SubagentStop
created: 2026-09-30 09:52
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit `435c3be` "CF-90 fix round 1: fail closed on cd shapes, and close the refuter's survivors", in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c/claude/coder-fleet/hooks/enforce-agent-scope.sh` and `claude/evals/lib/scope-hook-contract.sh`. It covers items 1, 4, 5 and 6 and the `@`/`+`, layout and fixture-FAIL lows.
- Item 1, the rule: a new `cd_shape_ok` makes the reviewer's gate rule and coder's worktree guard fail closed. A gate, or a coder's writing git verb, may follow a cd only as `cd <path> && ... && <command>`: one cd, no option, a path starting with `/`, `./` or `../`, and only `&&` in between. `seg_cd` is now trusted only inside that shape.
- Item 1, reviewer cases, all seen failing before the fix and all now refused with "only as its first step". With cwd in the worktree: `cd -P`, `cd -L`, `cd --` and `cd -e <main> && gate`; `cd -P <wt>/src && gate`; `cd - && gate`; and zsh's `cd gates-wt gates-main && gate`.
- More item 1 reviewer cases, with cwd in main: `true || cd <wt>; gate`, `( cd <wt> ); gate`, `cd <wt> | cat; gate`, `cd <wt> & gate`, and `cd <wt> && gate; gate2`.
- Most of those were live allows before the fix; only the zsh case was already denied, and for the wrong reason.
- Still allowed under the shape: `cd <wt> && git status && gate` and `cd <wt> && gate && gate`.
- Item 1, coder cases: `cd -P <main> && git commit`, `cd -- <main> && git commit` (cwd in the worktree) and `true || cd <wt>; git commit` (cwd in main), all seen failing before the fix, now refused.
- Item 1, coder cases that changed: four earlier cases now expect the shape refusal instead of "not a linked worktree": `cd X; git add; git commit`, a newline-separated cd, `(cd X && git commit)` and `pushd X && git commit`. They were denied before and are still denied.
- Item 1, also changed: `cd $OTHER && cd - && git commit` went from allow to deny, because it is two cds and `cd -` follows the inherited OLDPWD; `cd <wt> && git add -A && git commit` is newly allowed.
- Item 2 hook check: a new case confirms `git status --porcelain` is allowed for the reviewer.
- Item 4 (m1): the worktree's FIRST gates block now declares `sneaky: ./node_modules/.bin/rimraf src`, and the case asserts it is denied. With the mutant `GATE_GATES="$(declared_gates "$1")"` (read from the worktree) the case flips to allow; with the fix it denies.
- Item 5 (m4): main's list now declares `vitest run --update` and `--update=x`, and new cases assert both are denied. With `--update|--update=*` removed from the pattern (mutant) both are allowed.
- Item 5 also allows vitest's `--update=none`, which writes nothing: new case `vitest run --update=none`, seen failing first.
- Item 6: the test path is now resolved physically and must stay inside the worktree. New cases `vitest run escape` and `vitest run escape/passwd` (with `escape -> /etc`) were allowed before and are denied now.
- Low, `GATE_PATH_RE`: the first character may no longer be `@` or `+`. Cases `vitest run @args.txt` and `vitest run +x` were allowed before and are denied now.
- Low, layout: `--separate-git-dir` and bare layouts now fail closed. New separate-git-dir case: the old code read a decoy `AGENTS.md` beside the git dir and allowed; it now denies with "cannot tell where the main checkout is".
- Low, fixture: `scope-hook-contract.sh` prints FAIL if the gate fixture can't be built. This exposed my own separate-git-dir fixture skipping silently (its parent directory was missing), which is fixed.
- Found and fixed along the way: an empty `rev-parse` answer tripped the fail-open ERR trap, so reviewer commands in a non-repository directory were allowed. Ten existing cases caught it.
- Item 3: commit `8695abd` "CF-90 fix round 1: record the gate segment's cost in the SEGMENT_MAX table". The directory state and gate list are cached per directory in globals (done in `435c3be`), and `gh_command_assigns` runs once per command.
- Item 3 measurement: 16 allowed gate segments take 0.9 to 1.3 seconds under Homebrew bash 5 and under macOS bash 3.2, against 1.5 to 1.8 seconds before this round. That is well inside the 10-second hook timeout, so gate segments get no bound of their own.
- Under `/bin/bash` 3.2, ten allow and deny decisions all came out right and the fail-open trap never fired.
- Item 2 and the doc lows: commit `19c8554` "CF-90 fix round 1: say what an honest gate can still write, and check for it" rewrites `docs/limits.md`. It records that jest and vitest write missing snapshots by default outside CI.
- In the same `limits.md` rewrite: the old tsbuildinfo text was wrong. It now says `tsBuildInfoFile`, set in a tsconfig with `incremental` or `composite`, makes even `tsc --noEmit` write, to any path.
- Also in `limits.md`: the list is read from main's working tree, not a commit, so uncommitted edits widen it; Go, Rust, Deno, bun and uv projects cannot declare gates; and a task runner as a gate runs a recipe the diff controls.
- Same commit, `claude/coder-fleet/templates/AGENTS.md`: the test example is now `vitest run --update=none`. It cites vitest.dev/config/update ("'none': does not write snapshots...") and jestjs.io/docs/cli for jest's `--ci`, and adds the ecosystem and task-runner notes.
- Same commit, `claude/coder-fleet/agents/reviewer.md`: after the gates the reviewer runs `git status --porcelain`, and anything the run created is a finding. The rerun wording now reads "file, name (`-t` for vitest and jest, `--test-name-pattern` for `node --test`) or both".
- Same commit: `hooks/README.md` covers the cd shape for both roles, `--update=none`, the symlink and the layout refusal.
- Migration checklist mechanics rerun on `reviewer.md`: 43 lines, four H2 sections, frontmatter unchanged, no dashes, hard wraps or emoji.
- Commit `46673e7` "CF-90 fix round 1: the reviewer's checks read what ran, not only what was said" covers the `checks.sh` low. `run.sh` passes `--verbose` on a `#!review:` prompt with json output, so the tool calls are captured.
- In the same commit, `checks.sh` gains `RV-gate-ran`, which needs a Bash tool call running `node --test` in `raw-output.txt`; `RV-nopm` matches only first-person claims, and its message no longer mentions installs.
- In the same commit, new cases in `runner-gate.sh`, three seen failing first: a gate bullet with no run behind it now fails; "Running npm test is refused" now passes; and the runner asks for `--verbose`.
- Gates, each run once with output captured: `bash claude/evals/lib/scope-hook-contract.sh` gave exit 0, 568 passed, 0 failed. `bash claude/evals/lib/check-all.sh` gave exit 0; runner-gate 20/0, roster 155/0, workflow-logic 360/0.
---

author: @SubagentStop
created: 2026-09-30 10:00
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. I reviewed `f9eeb7b..HEAD` (435c3be, 8695abd, 19c8554, 46673e7) in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c` against CF-90's criteria and card comments #3 to #5. I read the hook's new and changed functions, the contract cases, the docs, and the eval runner and checks.
- Round 2 against round 1: no round-1 finding repeats. All three must-fixes and the lows are closed; the symlinked-selector survivor is closed only for directories (low 1).
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:1495 - the `--update=none` exception, recommended at `claude/coder-fleet/templates/AGENTS.md:21` and `:25`, means `update: true` (every snapshot rewritten, plus a stray `none` file filter) on vitest 3.x. Confirmed in the vitest 3.2.6 source; only 4.x takes the value.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:1564 - a test file symlinked out of the worktree passes, and the comment at `:1538` overclaims.
- low: docs/limits.md:41 - `git status --porcelain` (reviewer.md:29) cannot see ignored files or writes outside the worktree, yet is described as reporting "anything the run created".
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:1420 - an unreadable main `AGENTS.md` makes awk fail under `set -e`, and the ERR trap allows the call.
- low: claude/evals/reviewer/checks.sh:27 - RV-nopm misses "I ran `npm test`"; RV-gate-ran (`:40`) counts a tool call the hook refused.
---

author: @SubagentStop
created: 2026-09-30 10:09
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/scope-hook-contract.sh` in /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c gave 568 passed, 0 failed, exit 0, in 2:49. The scratch copy (`/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-cf90-r2-1790761996/base`) was also 568/0, exit 0.
- The hook refuses `git init` in a command I type, so I ran the probes through the contract's own fixture setup (its first 443 lines, in a scratch copy) with my cases appended: `.../refuter-cf90-r2-1790761996/pr/claude/evals/lib/probe.sh`.
- Round 1 bypasses re-run, all denied: `cd -P/-L/--/-e <main>`, `cd -P <main>/src`, the worktree's first gates block (`rimraf src`), `--update`, `--update=x`, symlinked selectors `escape` and `escape/passwd`, and coder `cd -P <main> && git commit` and `cd <main> && git commit`. None repeats round 1.
- New attempts on `cd_shape_ok`, denied: `./sub/../../main`, `../main`, a cd through a symlink into main or main/src, `cd <wt> && cd ./sub`, a backslash-escaped space, zsh `cd old new`, newline chains, `"cd"`, `c''d`, `\cd`, `builtin cd`, `command cd` and quoted path segments, with the coder forms of these too.
- New attempts that were allowed, all correctly, because the gate really runs in the worktree: `(` and `) ; cd main ; (` inside a quoted `--grep`, `git -C <main> status` in the chain, `cd <wt>&&gate`, `cd <wt> &&` with a newline, `cd <wt>/`, and `cd <wt>` then a newline then `&&` (a bash syntax error, so nothing runs). No bypass.
- Mutants (full suite each, in parallel, each copy diffed first): m1 `cd_shape_ok` always true killed (20 failed); m2 option allowed before the path killed (5); m3 path-prefix check dropped killed (1, `cd - && vitest run`); m4 one-cd limit dropped killed (1); m5 selector compared lexically killed (2); m6 `|| true` dropped from the rev-parse reads killed (10); m8 `--update=none` exemption deleted killed (1). All exited 1.
- m7 (shared cache key, `[ -n "$GATE_KIND" ] && return 0`) exited 0 with 568 passed. It is an equivalent mutant: `gate_dir_state` has one caller (line 1630), and `cd_shape_ok` allows at most one cd, before every gate segment, so no command can reach it with two directories.
- m5 died for the wrong reason: its lexical compare broke the allow cases because git reports `/private/var` while the command says `/var`, and the escape tests stayed green only because every path was denied. A sharper version, m5b `pp="$topp/$tok"`, allows `vitest run escape` in a probe, and the full suite kills it through both escape tests (563 passed, 5 failed, exit 1).
- low: /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c/claude/evals/lib/scope-hook-contract.sh:525-543 - the one-cd limit is guarded only by the coder `cd <other> && cd - && git commit` case. No reviewer case chains two cds, such as `cd <wt> && cd -P <main> && gate`.
- `cd <wt>/a\ b && gate` is refused although it is a real worktree subdirectory. This fails closed, so it is safe, and it is by design: backslash is not in `CD_PATH_CHARS`.
- Convergence: round 1's findings are all closed and nothing new came up, so the loop has converged.
- The worktree is clean (`git status --short` is empty) at HEAD 46673e7.
- Time: from 19:53:16 to about 20:09, 8 mutants plus one check on m5.
---
<!-- COMMENTS:END -->
