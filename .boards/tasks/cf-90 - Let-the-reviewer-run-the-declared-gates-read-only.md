---
id: CF-90
title: Let the reviewer run the declared gates read-only
status: In Progress
assignee: []
created_date: '2026-09-30 08:32'
updated_date: '2026-10-04 13:19'
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
- [x] #1 The reviewer can run each command in a project's declared gate list, and a single-file or single-test form of its test runner, in the review worktree; each is covered by a scope-hook test that allows it
- [x] #2 Every command in the denied list is refused for the reviewer, with a scope-hook test per class: package manager verbs, including `pnpm --filter x typecheck`; snapshot update; `--fix`; watch; in-repo build output; network; and the main checkout as the working directory
- [x] #3 agents/reviewer.md states the new boundary (run the declared gates read-only, never change the diff or its dependencies) in place of 'never run tests, builds or installs', and its handoff reports each gate's command, exit code and counts
- [x] #4 An eval prompt shows the reviewer running the gates on a diff with a failing test and reporting the failure as a finding
- [ ] #5 lead.md step 4 and the fleet design describe the reviewer running declared gates, landed in the lead.md track after CF-51, CF-24.1 and CF-53
- [ ] #6 bash claude/evals/lib/check-all.sh passes; migration-checklist run over reviewer.md and lead.md
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

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

created: 2026-09-30 10:09
---
Round 2, 2026-09-30. Review: request changes, one must-fix: `--update=none` means 'update all snapshots' on vitest 3.x (read in the installed 3.2.6 source); only 4.x takes the value. All round-1 must-fixes are closed by design. Lows: a symlinked test file escapes; `git status --porcelain` can't see ignored files; an unreadable AGENTS.md fails open through the ERR trap; the eval checks. Refuter: converged, with no bypass (round-1 repeats and new cd_shape_ok attempts all denied), 7 of 8 mutants killed, and m7 equivalent. Fix round 2 (coder resumed) covers the must-fix and all lows. Filed: CF-104 (quote-aware segmenter, since naive quote pairing can move a reviewer gate into main; zsh chdir and eval in the coder guard).
---

author: @SubagentStop
created: 2026-09-30 10:30
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Must-fix, commit `b87fc93` "CF-90 fix round 2: refuse every --update, allow a leading CI=true instead", in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c/claude/coder-fleet/hooks/enforce-agent-scope.sh` and `claude/evals/lib/scope-hook-contract.sh`.
- Why every `--update` is refused: vitest 3.x takes `--update` with no value and rewrites every snapshot, and the hook cannot tell which vitest a worktree has. The case `vitest run --update=none` changed from allow to deny "snapshot" and was seen failing first.
- Why `CI=true` is safe, source 1: vitest 3.2.4 `packages/vitest/src/node/config/resolveConfig.ts` has `updateSnapshot: isCI && !UPDATE_SNAPSHOT ? 'none' : UPDATE_SNAPSHOT ? 'all' : 'new'`, with `isCI` from std-env (`!!env.CI || ...`).
- Why `CI=true` is safe, sources 2 and 3: vitest.dev/config/update says an unset `update` behaves as `'none'` in CI on vitest 4; jest 29.7.0 `packages/jest-config/src/Defaults.ts` has `ci: isCI` from ci-info. The value is fixed, so there is nothing for the hook to misread.
- New `CI=true` cases, all seen failing first: `CI=true ./node_modules/.bin/vitest run` is allowed (it matches the new declared gate `ci`); `CI=true timeout 60 vitest run` is denied "wrapper"; `CI=true vitest run -u` is denied "snapshot"; `CI=true eslint src` is denied "not a declared gate".
- More `CI=true` cases, already denied and kept as guards: `CI=1 vitest run` (assigns), `CI=true NODE_OPTIONS=... vitest run` (assigns), `NODE_OPTIONS=... CI=true vitest run` (assigns).
- Low 1 (same commit): a test path that is itself a symlink is now refused. New case `vitest run leak.test.ts` (with `leak.test.ts -> /etc/hosts`) was allowed before and is denied now. The comment at the old line 1538 now says `phys_path` resolves directories only.
- Low 2 (same commit): case `git status --porcelain --ignored` is allowed for the reviewer. It already was; the case keeps it that way.
- Low 3 (same commit): `GATE_GATES="$(declared_gates ...)" || GATE_GATES=""`, plus the same guard on the two `cd ... && pwd -P` assignments in `gate_dir_state`. New case: a main checkout whose `AGENTS.md` is `chmod 000` was allowed through the ERR trap before; it is now denied "declares no gates".
- Low 3 audit: every other `$( )` assignment in the reviewer and coder paths calls a function that ends in `printf`, or its failing commands sit in `&&`/`||` lists or `if` tests, which the ERR trap ignores.
- Low 5 (same commit): new case `cd <wt> && cd -P <main> && gate` is denied "only as its first step". It already denied, so it is shown against a mutant that drops `[ "$2" -eq 1 ] || return 1`: the mutant allows, the original denies.
- Low 4, commit `3c687e8` "CF-90 fix round 2: a gate counts as run only when a non-refused result answers it", in `claude/evals/reviewer/checks.sh` and `claude/evals/lib/runner-gate.sh`.
- RV-gate-ran now pairs each `node --test` tool_use with the tool_result carrying its id, and ignores a result whose text holds the hook's "reviewer invariant" refusal. It reads the text rather than `is_error`, because a failing test's exit 1 may also be `is_error`.
- RV-nopm now also catches a backticked or quoted `I ran \`npm test\``.
- New runner-gate cases, all seen failing first: a backticked npm claim, a refused gate call, and a gate call with no result. The stub's review stream now carries a tool_result.
- Docs, commit `58d5289` "CF-90 fix round 2: CI=true, not --update=none, and a narrower claim for git status". `templates/AGENTS.md` now uses `test: CI=true ./node_modules/.bin/vitest run` with the three sources above. It says `--update=none` is refused because vitest 3.x rewrites every snapshot with it (4.x checked in 4.1.10, 4.0 not checked).
- In the same commit, `docs/limits.md` matches, and says `git status --porcelain --ignored` sees only the review worktree: not writes outside it, and not a change later restored.
- In the same commit, `reviewer.md` uses `git status --porcelain --ignored` and says it cannot claim the run wrote nothing; `hooks/README.md` records `--update=none` as a snapshot update and `CI=true` as the one exempt assignment.
- Migration checklist mechanics rerun on `reviewer.md`: 43 lines, four H2 sections, frontmatter unchanged, no dashes, hard wraps, emoji or double-check prompts.
- Gates, each run once with output captured: `scope-hook-contract.sh` exit 0, 579 passed, 0 failed; `runner-gate.sh` exit 0, 23 passed, 0 failed; `check-all.sh` exit 0, "Every deterministic check passes".
---

created: 2026-09-30 10:30
---
Fix round 2 landed in the coder's worktree (agent-a81491a7200998c1c; not on main yet). b87fc93: every `--update` form is now refused (vitest 3.x rewrites every snapshot with `--update=none`); the non-writing route is a leading literal `CI=true`, allowed only where the declared gate itself carries it (sources: vitest 3.2.4 resolveConfig.ts, vitest.dev for 4.x, jest 29.7.0 Defaults.ts). Same commit: symlinked test files refused; an unreadable AGENTS.md now fails closed ('declares no gates') instead of falling through the ERR trap; a reviewer case for two chained cds. 3c687e8: RV-gate-ran pairs each tool_use with a non-refused tool_result; RV-nopm catches a backticked claim. 58d5289: docs (template, limits, reviewer.md using `git status --porcelain --ignored`, hooks README). Gates reported: scope contract 579/0, runner-gate 23/0, check-all exit 0. The CI=true exemption is a new allowance on an authorisation boundary, so it gets review round 3 and a refuter before convergence. The live check of a refused tool_result's shape goes to CF-100.
---

author: @SubagentStop
created: 2026-09-30 10:39
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve. Reviewed `46673e7..HEAD` (b87fc93, 3c687e8, 58d5289) in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c` against CF-90's card and round 2's findings (comments #7 and #9). No finding repeats round 2; Low 3 extends round 2's RV-gate-ran low.
- Checked the `CI=true` sources against installed vitest 2.1.9, 4.1.8, 4.1.11 and 5.0.0, std-env 4.2.0, jest-config 27.5.1 and 30.2.0, ci-info, and the mri code bundled in cac 7.0.0. The claim holds; config files and an inherited `UPDATE_SNAPSHOT` can still undo it, as limits.md records.
- Hook parsing: every `CI=true` variant tried fails closed or is equivalent to plain `CI=true`. Scout's and coder's assignment rules are unchanged.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:1502 - `-u=true`, `--u`, `--u=true` and `-tu=x` update snapshots in vitest and jest but are not refused (reachable only from a declared gate).
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:1671 - a bare `CI=true ` segment passes the assignment check (harmless); the comment at `:1667` and hooks/README.md:286 say otherwise.
- low: claude/evals/reviewer/checks.sh:57 - RV-gate-ran counts a permission-system refusal as a run.
- low: claude/evals/lib/scope-hook-contract.sh:604 - the unreadable-AGENTS.md case passes on a failed fixture; also no case covers `gate_flag_denial "$body"` at enforce-agent-scope.sh:1708.
---

created: 2026-09-30 10:39
---
Review round 3, 2026-09-30: approve. `CI=true` holds against installed vitest 2.1.9, 4.1.x and 5.0.0 and jest 27 and 30; every parsing variant tried fails closed or equals plain `CI=true`; scout's and coder's rules are unchanged. Nothing repeats round 2. Lows: (1) `-u=true`, `--u`, `--u=true` and `-tu=x` update snapshots but aren't refused when a gates block declares them. Card criterion #2 says snapshot updates are refused whatever the list says, so I'm treating this one as required, not optional. (2) A bare `CI=true ` segment passes (harmless), which the comment and README deny. (3) RV-gate-ran counts a permission-system refusal as a run. (4) The unreadable-AGENTS.md case has no fixture guard, and no case pins `gate_flag_denial "$body"`. The harness flagged the review's text as instruction-shaped; I read it and found it's a normal review, with nothing acted on as an instruction. One fix round will cover these once the round-3 refuter reports.
---

author: @SubagentStop
created: 2026-09-30 10:40
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline in the scratch copy, before any mutation: `bash claude/evals/lib/runner-gate.sh` exit 0, 23 passed, 0 failed, 10s; `bash claude/evals/lib/scope-hook-contract.sh` exit 0, 579 passed, 0 failed, 201s.
- Budget: at most 8 mutants, 20 minutes from 20:31:17. 7 mutants run; handoff at about 20:41.
- survived: m7, in `claude/evals/reviewer/checks.sh:57`, `select(.id == $id and ((.text // "") | contains("reviewer invariant") | not))` changed to `select(((.text // "") | contains("reviewer invariant") | not))` - RV-gate-ran counts a refused `node --test` as run whenever any other tool call in the transcript returns a result; runner-gate stays 23/0, exit 0. Reproduction: `raw-output.txt` holds tool_use t1 `node --test` and t2 `ls`, with t1's result "reviewer invariant: refused" and t2's "README.md"; the unmutated `checks.sh` prints `FAIL RV-gate-ran` and m7 prints `PASS RV-gate-ran`.
- m1, the literal-value check (the sed and the `body` strip accept any `CI=` value): killed, exit 1, 578/1 (`CI=1 ./node_modules/.bin/vitest run` refused, but not for "assigns"). The command stays refused under m1 because the final gate match still wants the literal `CI=true`, so the literal check only decides the refusal message. Running the probe list against m1 only newly allowed `CI=tru\e`, which the shell reads as `true`.
- m2, "the declared gate must carry `CI=true` too" (`gate_match "$words"` changed to `gate_match "$body"`): killed, exit 1, 578/1 (`CI=true ./node_modules/.bin/eslint src` allowed).
- m3, the `--update` refusal (`--update=none) continue ;;` put back): killed, exit 1, 578/1 (`--update=none` allowed). The other `--update` forms, including `-u=false`, `--updateSnapshot=false`, `-uu`, `-tu x` and `-U`, are refused by the unmutated hook in my probes.
- m4, the symlinked test file (the `[ -L ... ] && return 1` line deleted): killed, exit 1, 578/1 (`vitest run leak.test.ts` allowed).
- m5, the fail-closed guard (`|| GATE_GATES=""` removed): killed, exit 1, 578/1 (`vitest run` allowed in the worktree whose main `AGENTS.md` can't be read).
- m6, the refusal filter (the `contains("reviewer invariant") | not` test replaced with `true`): killed, runner-gate exit 1 ("a gate call the hook refused is not a run: checks exit 0, wanted 1").
- Bypass probes: 64 commands through `probe.sh`, compared with the pre-change hook from 46673e7. No bypass found; the newly allowed commands all leave `CI` as the literal `true`. Round 2's bypasses stay refused, so nothing repeats round 2.
- Commands: the scratch tree is `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790764277/`. Mutations come from `python3 mutate.py <scratch> m1..m7`; each suite ran in its own copy (`m1`..`m7`), with output in `<m>.out` and `<m>.rc`. Probes are `bash probe.sh <copy> probes.txt` and `probes2.txt`; pre-change verdicts are in `pre.out` and current ones in `post.out`.
---

created: 2026-09-30 10:40
---
Refuter round 3, 2026-09-30: 6 of 7 mutants killed, and 64 probes against the CI=true exemption found no bypass (every newly allowed command leaves CI as the literal true). Round 2's findings all stay refused, so nothing repeats. Survivor m7: RV-gate-ran's result select without the id match passes a refused gate call as long as any other tool call returns a result. Fix round 3 (coder resumed, the last planned): the m7 case; refusing every short cluster containing `u` (with or without a value) plus `--u` and `--u=*` (criterion #2); a bare or `&&`-joined `CI=true`; RV-gate-ran not counting a permission refusal; the fixture guard on the unreadable-AGENTS.md case; and a case pinning `gate_flag_denial "$body"`. Then I check the survivor and the new spellings myself before the PR.
---

author: @SubagentStop
created: 2026-09-30 10:54
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Item 2, commit `61abbb2` "CF-90 fix round 3: every spelling of a snapshot update, and CI=true only in front of a gate", in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a81491a7200998c1c/claude/coder-fleet/hooks/enforce-agent-scope.sh` and `claude/evals/lib/scope-hook-contract.sh`.
- Item 2, what `gate_flag_denial` now refuses: `--u`, `--u=*` and cac's dotted `--update.*`, and any short cluster containing `u` or `w`, with or without `=value` (`^-([A-Za-z]+)(=.*)?$`).
- Item 2, cases: each spelling is declared in main's gate list and gets its own case. `-u=true`, `--u`, `--u=true`, `-tu=x`, `--update.x` and `-u=false` were all seen allowed before the fix; `-uu` and `-tu x` were already refused and are now pinned.
- Item 3, same commit: I chose to change the hook rather than narrow the comments. `reviewer_ci_stripped` exempts `CI=true` only where a command follows it in the same segment and that command is not a read.
- Item 3, cases: `CI=true ; gate`, `CI=true && gate` and `CI=true grep -rn x src; gate` were each seen allowed before the fix and are now denied "assigns". `CI=true ./node_modules/.bin/vitest run` stays allowed. The hook comment and `hooks/README.md` now say this.
- Item 5, same commit: the unreadable-`AGENTS.md` case prints FAIL if its fixture wasn't built, and prints SKIP with the reason if the file is still readable after `chmod 000` (root).
- Item 5, the pin: a declared `ciemit: CI=true ./node_modules/.bin/tsc` is denied "build output". With `gate_flag_denial "$words"` in place of `"$body"` (mutant) it is allowed.
- Items 1 and 4, commit `ccae188` "CF-90 fix round 3: a gate run needs its own result, holding runner output", in `claude/evals/reviewer/checks.sh` and `claude/evals/lib/runner-gate.sh`.
- Item 4: RV-gate-ran now also requires the paired result to hold `node --test`'s own summary, a `tests`, `pass` or `fail` count line with `# ` (TAP) or `ℹ ` (spec). I checked that node 25 prints the spec summary even when piped.
- Item 4, cases: "a permission refusal is not a run" was seen passing before the fix and fails now. "the spec reporter summary counts as a run" passes. The stub's stream now carries a summary.
- Item 1 (m7): new case "a refused gate is not rescued by a later read". t1 is `node --test` answered by the "reviewer invariant" refusal; t2 is `cat old-run.log`, whose ordinary result carries a `# tests` summary, so only the id match tells them apart.
- Item 1, result: that case FAILs RV-gate-ran as required. With the id match removed from `checks.sh` (the m7 mutant) runner-gate goes 25/1 on exactly that case; `checks.sh` was restored afterwards.
- Item 1, why t2 is a log read and not `ls`: with the item-4 summary requirement in place, an `ls` result would fail the id-less mutant for the wrong reason, so m7 would still survive.
- Gates, each run once with output captured: `scope-hook-contract.sh` exit 0, 592 passed, 0 failed, no SKIP; `runner-gate.sh` exit 0, 26 passed, 0 failed; `check-all.sh` exit 0, "Every deterministic check passes".
---

created: 2026-09-30 10:59
---
Sub-issue 1 of 1: ready to merge in PR #51. Done still needs: #5 (the lead.md track, after CF-51, CF-24.1 and CF-53), the merge, and the batched version bump (#6's release half). Fix round 3 (61abbb2, ccae188) checked by the lead: scope-hook-contract 592/0 and runner-gate 26/0 on the branch head. Reverting the `-u=*`/`--u` refusal in a scratch copy fails the contract (584 passed, 8 failed); removing RV-gate-ran's id match fails runner-gate (25 passed, 1 failed). The branch is cut from origin/main fbf51e5 (14 commits, no board files) and pushed as cf-90-reviewer-gates, so it isn't stacked.
---

created: 2026-09-30 13:25
---
Merged to main at 7e129f4 (PR #51), released in v0.29.0. Ticks: #1 and #2 are proven by scope-hook-contract.sh on main (592 cases; the gate allow cases, and one case per denied class including `pnpm --filter x typecheck` and every snapshot-update spelling); #3 by reviewer.md on main; #4 by prompt 05-failing-gate, pinned deterministically by runner-gate.sh. Done still needs: #5 (lead.md step 4 and fleet-design, in the lead.md track after CF-53) and the lead.md half of #6's migration checklist, run with that edit.
---

author: lead
created: 2026-10-04 13:19
---
Resumed 2026-10-04. Remaining: #5 (lead.md step 4 and fleet-design describe the reviewer running declared gates) and the lead.md half of #6 (migration-checklist). Both are queued until PR #55 (CF-111) merges, because #55 also edits lead.md step 4. They'll be built together with CF-52 #4 in one lead.md change.
---
<!-- COMMENTS:END -->
