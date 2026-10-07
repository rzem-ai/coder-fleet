---
id: CF-29
title: Run the board fork's tests in CI
status: In Progress
assignee: []
created_date: '2026-09-27 03:18'
updated_date: '2026-10-07 09:37'
labels:
  - outcome/shipped
dependencies: []
references:
  - .github/workflows/checks.yml
  - claude/evals/lib/check-all.sh
  - claude/coder-fleet/board
priority: Medium
type: enhancement
ordinal: 288000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by spec-writer while drafting CF-24 and CF-25. `claude/evals/lib/check-all.sh` skips the board package's own tests when bun is absent, and `.github/workflows/checks.yml` installs no bun, so every change to the carried board fork (CF-25's field, CF-26, CF-27) is proven only on the machine that ran it, and the live SubagentStart/Stop contract cases never run in CI either (see CF-8's PR notes). Add bun to the workflow, pinned, and make check-all fail rather than skip when CI=true and bun is missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 checks.yml installs a pinned bun and the board package tests run in CI
- [x] #2 The live board-hook contract cases run in CI
- [x] #3 check-all.sh fails, not skips, when CI is set and bun is absent
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
created: 2026-09-30 09:13
---
2026-09-30: CF-24.2 adds a board-backfill contract lane that also skips in CI without bun, alongside the board lane. Both run only locally until this lands.
---

created: 2026-10-07 09:25
---
Ordered by the human, 2026-10-07 (chosen in the session from the lead's list). Sub-issue 1 of 1: started. Done still needs: criteria 1 to 3.

Context the builder needs: since this card was filed, the board section and the board-backfill, board-git-check and live board-hook cases all depend on bun, and CF-21 showed a Linux-only failure that only CI could catch, so bun in CI now covers far more than the fork's own tests. CF-56.1 is being built in parallel and also edits check-all.sh (the rc-file handling around line 135); this card's change is the bun-missing skip around lines 174-187.

Done: nothing yet; a scripter is being spawned.

Not done: CI still skips every bun-dependent check.
---

author: @SubagentStop
created: 2026-10-07 09:34
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Branch `cf-29-bun-in-ci`, cut from origin/main and pushed with no PR. Head is `f789fb2`. Commits: `Run the board tests in CI and fail check-all when CI has no bun (CF-29)`, `Temporary: run CI on the cf-29-bun-in-ci push (CF-29)`, its `Revert`, and `Size the CI job timeout from the measured run (CF-29)`.
- Criterion 1: `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a5dc8ac92d9518ced/.github/workflows/checks.yml` now has `oven-sh/setup-bun@v2` with `bun-version: 1.3.14`, then `bun install --frozen-lockfile` in `claude/coder-fleet/board`.
- I matched 1.3.14 to the `@types/bun` and `bun-types` entries in `board/bun.lock`. `package.json` has no engines or `packageManager` field, and `install-home.sh` installs whatever bun.sh serves, so neither pins a version. My local bun is 1.3.10.
- The board section ran in CI: `board: ok (114.9s)`. That covers `tsc`, the build and the fleet-owned `bun test` list.
- Criterion 2: the live board-hook cases and the `board-backfill` and `board-git-check` sections ran in CI and passed. `board-hook-contract` took 116.2s, `board-backfill` 90.4s and `board-git-check` 11.9s. I did not read the log for a "live" marker in the hook contract, so that the live cases ran is inferred from bun being on PATH.
- Criterion 3: `claude/evals/lib/check-all.sh` has a new `no_bun` helper. Both bun-absent branches (board install and board) fail when `CI` is non-empty and skip otherwise.
- The new contract is `claude/evals/lib/check-all-ci-bun.sh`, registered as `run check-all-ci-bun` in `check-all.sh` and listed in its header. It runs a stubbed copy of `check-all.sh` with every bun-holding PATH entry removed, and has 8 cases.
- The cases are: CI set with no bun exits 1 with `board install` and `board` FAILED and the closing line naming the board; CI unset with no bun exits 0 and both skip; CI set with a stub bun gives `board: ok`.
- Seen failing first: before the fix, four cases failed (exit 0 instead of 1, `board install` and `board` not failing, and the FAILED line not naming the board). After the fix all 8 print `ok`.
- Timeout: `timeout-minutes: 10`. CI run 37600773492 took 2m32s on attempt 1 (check-all total 116.3s, slow checks 25s) and about 1m45s on the rerun. The timeout is roughly four times the slower run.
- CI result: attempt 1 failed with `agent-pairs-contract` as the only failing section. The rerun of the failed job passed.
- Local run: `bash claude/evals/lib/check-all.sh`, output in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/b60f21ed-bab8-46da-b450-232af096a73a/scratchpad/check-all.out`. Exit 0, `total: 191.2s`, every section ok. That is over the 180s budget, but the other coder's suite was probably running alongside.
- I stayed off the CF-56.1 files. The only overlap is my edit to `check-all.sh`: the `no_bun` helper, one run line and header lines.
---

created: 2026-10-07 09:37
---
Sub-issue 1 of 1: merged to main in PR #84, released as v0.39.7 (annotated tag on 5b68689). Done still needs: nothing.

Done: every push and PR now runs the board fork's tests, the live board-hook cases, board-backfill and board-git-check on Linux in CI, and a CI run with no bun fails instead of passing silently.

Evidence: 1, checks.yml installs bun 1.3.14 (oven-sh/setup-bun, matching bun.lock) and runs bun install --frozen-lockfile; the board section ran ok in CI (114.9 s) on branch run 37600773492. 2, the board-hook-contract section ran with bun present in that run (116.2 s) and passed; that the live cases ran is inferred from bun being on PATH, not from a log marker. 3, check-all-ci-bun.sh (8 cases, four failing before the fix) in check-all.sh. CI SUCCESS on 5b68689; 10-minute job timeout against a 2.5-minute run.

Definition of Done: 1 as above. 2, a CI config and a check-all helper under the size floor, read by the lead as its one review; no code path a refuter targets. 3, 5, 6 not applicable. 4 v0.39.7 tagged and pushed.

Not done: the branch run's first attempt failed on the CF-156 pipe race in gen-agent-pairs.sh, which can still fail any CI run at random until CF-156 is fixed.
---
<!-- COMMENTS:END -->
