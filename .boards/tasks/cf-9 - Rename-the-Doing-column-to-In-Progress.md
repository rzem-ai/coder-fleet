---
id: CF-9
title: Rename the Doing column to In Progress
status: To Do
assignee: []
created_date: '2026-09-27 01:23'
updated_date: '2026-09-27 03:06'
labels: []
dependencies:
  - CF-8
references:
  - docs/plans/CF-8.md
  - claude/coder-fleet/templates/board.config.yml
  - .boards/config.yml
  - claude/coder-fleet/skills/glossary/SKILL.md
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - docs/plans/CF-9.md
priority: High
type: enhancement
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The fleet's second column is "Doing", but models reach for "In Progress" by default (it is also Backlog.md's upstream default), and the mismatch keeps breaking boards across projects. Observed 2026-09-27: SubagentStart logged `board task edit failed (exit 1): invalid status "In Progress"` for CF-8 here and for BD-41 in another project, from a user-scope BOARD_COL_DOING override. The human decided to adopt "In Progress" as the fleet's name rather than keep correcting toward "Doing".

Decisions taken with the human:
1. Stack after CF-8: lands on top of CF-8's merge, released as v0.26.0.
2. Hooks accept either: the canonical name becomes "In Progress", but the hooks read each board's `.boards/config.yml` statuses and write whichever of "In Progress" or "Doing" it lists, so old boards keep working and the board.env override is unnecessary.
3. Other projects migrate through /kickoff and /init, which detect "Doing" and offer the rename (config plus live items) one project at a time with the human's yes. Nothing outside this repository changes in this item.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The fleet's canonical second column is "In Progress" everywhere it is named: board config template, this repo's .boards/config.yml (live items migrated), glossary skill and regenerated rule, board-conventions, design section 7, hooks README, commands
- [ ] #2 SubagentStart resolves the column from the board's config statuses and writes In Progress or Doing, whichever the config lists; contract tests cover both spellings and a config listing neither
- [ ] #3 /kickoff and /init detect a board still on Doing and offer the rename, changing nothing without the human's yes
- [ ] #4 bash claude/evals/lib/check-all.sh passes; OpenCode port divergence recorded if the port names the column; v0.26.0 bump
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 01:39
---
Plan docs/plans/CF-9.md approved by the human 2026-09-27 with the recommended answers: this repo's rename after the merge via /kickoff, BOARD_COL_DOING keeps its name, GPTA-1 and the board package fixtures unchanged. Includes a yes-gated exception to "no command writes a status" for the kickoff/init rename. Coder starts once CF-8 merges.
---

author: @SubagentStop
created: 2026-09-27 02:50
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit `5eba390` Add the approved plan for CF-9.
- Commit `fdf7f58` Resolve the in-progress column from the board's statuses (Phase 1).
- Commit `2e91042` Call the second column In Progress in the vocabulary and the prose (Phase 2).
- Commit `3216c88` Offer the Doing to In Progress rename in /kickoff and /init (Phase 3).
- Commit `bfd93b9` v0.26.0: the second column is In Progress, and the hooks take either name (Phase 4).
- Phase 1 was test first, in `claude/evals/lib/board-hook-contract.sh`: the `unset BOARD_COL_*` line, block R16 with a stub board binary, and the live cases `live-start-in-progress` and `live-start-doing-board`. The contract file's line numbers had moved: the library block ends at 489, the live config is at 527, the move checks at 545-546.
- Red run, before `lib/board.sh` or the start hook were touched: `bash .../board-hook-contract.sh -v` gave exit 1, 62 passed and 9 failed. The failures were `start-col-in-progress`, `start-col-case`, `start-col-both`, `start-col-neither`, `start-col-override`, `start-col-dry-run`, `start-col-probe-error`, `live-start-in-progress` and `live-start-commits`. The logs showed `invalid status "Doing"` and `would move BD-1 to Doing`. `start-col-doing` and `live-start-doing-board` passed, as the plan expects.
- Green run, same command: exit 0, 71 passed and 0 failed. All 8 `start-col-*` cases and all 11 live cases pass, the live cases running against bun on the worktree's `src/cli.ts`.
- What makes each new test fail: going back to a fixed `Doing` in `board-subagent-start.sh` fails the six `start-col-*` cases other than doing and override, plus the two live In Progress cases. Removing the "BOARD_COL_DOING is set" log line fails `start-col-override`.
- `start-col-doing` and `live-start-doing-board` were green before the change. To see their new half fail, I stopped the probe from staying quiet about the expected "invalid status" answer (the `BOARD_CLI_QUIET_INVALID_STATUS` check). The run gave exit 1, 69 passed and 2 failed, and those were exactly those two cases. I then restored the file with `git checkout`.
- Phase 1 checks: `/bin/bash -n` passes on `lib/board.sh` and `board-subagent-start.sh`. The `BOARD_COL_DOING` grep finds only the library default (`lib/board.sh:29`) and the resolver (409-430). `handoff-parity.sh` exits 0 with 29 cases agreeing.
- Phase 2 checks: `gen-glossary-rule.sh --check` is up to date, `roster-contract.sh` has 155 passed, `instruction-file-contract.sh` has 13 passed, and `jq -e .` on `hooks.json` exits 0. No pinned line was edited. The only file changed under `opencode/` is the one word in `opencode/coder-fleet/skill/glossary/SKILL.md`, and nothing under `codex/` changed.
- Phase 3 rehearsal: its output is above the handoff. Every check the plan lists holds: the config lists In Progress, BD-1 moved to In Progress, both commits carry the kickoff trailer, `task list --status Doing` exits 1 with `invalid status`, and SubagentStart then writes In Progress.
- Phase 4: version bumped to 0.26.0 in `claude/coder-fleet/.claude-plugin/plugin.json:5` and `.claude-plugin/marketplace.json:17`. The migration-checklist table is above the handoff.
- One suite run: `bash /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a814776a7dfcd134a/claude/evals/lib/check-all.sh > /var/folders/3b/yg6wtc4j12g53bt8mx90jcrc0000gn/T/cf-9-check-all.txt 2>&1` gave exit 0. Grepping the file for `FAILED` finds nothing, and line 353 reads "Every deterministic check passes." Per-suite counts: 132, 71, 327, 155, 115, 5 and 13 passed, all with 0 failed.
---

author: @SubagentStop
created: 2026-09-27 02:55
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Reviewed round 1 of CF-9 (`origin/main...cf-9-in-progress-column`, 18 files) against `docs/plans/CF-9.md` and `AGENTS.md`, in the order the brief asked.
- Verdict: request changes, for a small fix round covering findings 1 to 4 above the handoff.
- Memory search found no earlier decision on this subsystem that these findings contradict.
---

author: @SubagentStop
created: 2026-09-27 03:06
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Scratch tree: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/copy`. Made from the checkout's tracked files plus `git diff --binary origin/main...cf-9-in-progress-column | patch -p1` (exit 0). All 18 changed files match `git show cf-9-in-progress-column:<file>` byte for byte, checked twice, the second time after I found the other agent.
- Baseline: `bash claude/evals/lib/check-all.sh` in the copy, output in `.../scratchpad/baseline.out`: exit 0, "Every deterministic check passes.", 3m36s. The contract suite alone (`.../scratchpad/run.sh <tree> skip|live 5|32 <out>`) is green in all four setups: 60/60 with the live pass skipped, 71/71 with it on.
- "Skipped" needs both a PATH without bun and `HOME` pointed at an empty dir. Without the `HOME` change, the shim quietly falls back to `~/.local/bin/board`, which exists on this machine, so the live pass would still run.
- bash 3.2 setup: `/bin/bash --version` is `3.2.57(1)-release`. I put a wrapper named `bash` first on PATH (it logs `$BASH_VERSION`, then runs `/bin/bash`), so every `#!/usr/bin/env bash` hook ran under 3.2. The trace shows 23 `board-subagent-start.sh` runs, plus every stub and shim call, all under 3.2.57. No PATH guard got in the way.
- bash 3.2 result: skip 60/60 and live 71/71, exit 0. No 3.2-only crash, and no unbound, bad-substitution or syntax errors in either output. The new code uses none of the 3.2 traps (no arrays, no `${,,}`, no `[[ -v ]]`, no mapfile). The dynamic-scope `local BOARD_CLI_QUIET_INVALID_STATUS=1` works under 3.2: `start-col-doing` passes there, and it depends on that.
- Budget: 13 mutants, each run in both modes, one hour, later cut to the 20-minute cap. Everything is in `claude/coder-fleet/hooks/lib/board.sh`; `mutate.py` insists on exactly one match per edit.
- Killed, M1, loop order swapped to `"Doing" "In Progress"`: `start-col-both`, skip and live.
- Killed, M2, a board listing both returns Doing (collect a match, prefer the last): `start-col-both`, both modes.
- Killed, M3, override ignored (`if [ -n "${BOARD_COL_DOING:-}" ]` → `if false`): `start-col-override`, both modes.
- Killed, M4, override probes anyway (`board_status_listed "$hook" "$BOARD_COL_DOING" || true` added before its printf): `start-col-override`, both modes.
- Killed, M5, dry run starts the CLI (`if ! board_would_send && false`): `start-col-dry-run`, both modes.
- Killed, M8, probe error treated as not-listed (`if [ "$rc" -eq 2 ]; then return 1; fi` → `:`): `start-col-probe-error`, both modes.
- Killed, M9, quiet mode dropped (`elif … QUIET … = "1"` → `elif false`): `start-col-doing` in both modes, and also `live-start-doing-board` in the live run.
- Survivors: M6, M10 and M11 each exited 0 in both modes. Edits and effects are under Decisions needed.
- Convergence: resolver mutation has converged, with 7 of the 10 lead-named mutants killed and 3 survivors, all about logging or write attempts. A round 2 is warranted but narrow: it only needs to cover the Not done items below.
---
<!-- COMMENTS:END -->
