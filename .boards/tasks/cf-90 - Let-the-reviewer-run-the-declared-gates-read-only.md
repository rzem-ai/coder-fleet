---
id: CF-90
title: Let the reviewer run the declared gates read-only
status: In Progress
assignee: []
created_date: '2026-09-30 08:32'
updated_date: '2026-09-30 09:12'
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
<!-- COMMENTS:END -->
