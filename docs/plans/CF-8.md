# CF-8: align the hooks, the design and board-conventions (CF-6 folded in)

Status: approved by the human on 2026-09-27, with the open questions resolved as listed at the end. Board items: CF-8, with CF-6 closing alongside it. Release: v0.25.1.

## Decisions already taken

1. Delete the dormant status branch from `board-subagent-stop.sh`; Blocked is written by `TaskCompleted` only.
2. Design section 3 points at the glossary skill instead of carrying a table.
3. Design section 7's To do row matches board-conventions.
4. The steward stops naming a "Coder Fleet" project.

## Findings that shape the plan

- **`stop-status-honest` must change, not just go.** The log line it asserts (`board-hook-contract.sh:216`) exists only in the `""` arm of the status case. It is replaced by a guard that a status field changes nothing, which fails today - so Phase 1 has a real failing-test-first step.
- **`handoff-parity.sh:61` sends `status:"success"`** - harmless after the change, but a lie. `handoff-check.sh`, `handoff-extractor-parity.sh` and the 28 fixtures never mention status. The extractor parity test lifts `extract_section` out of the hook by `sed` from its opening line to its closing brace, so the function body must stay byte-identical; the comment above it may change.
- **`hooks.json:2` says "SubagentStop writes Blocked"** - a fifth prose site the brief did not name.
- **`TaskCompleted` writes Blocked in two cases**: failing tests, and a strict gate with no result (`board-task-completed.sh:207-211`). AC #2 says "failing tests only"; the prose below states both.
- **`BOARD_RUN_STATUS="$status"` (hook:312) feeds the archive header** (`lib/board.sh:208`). Every SubagentStop archive today says `Status: success`; after this change it says `Status: not recorded`. The only observable change other than the dropped log line, and no test asserts it.
- **Nothing parses design section 3.** `roster-contract.sh:138` greps only rows shaped `` | `agent` | `` (section 4). `instruction-file-contract.sh` pins line 167 (section 8) and one section 10 line verbatim - neither may be edited.
- **"There is no third copy anywhere" stays false after section 3 goes**: `opencode/coder-fleet/skill/glossary/SKILL.md` is a deliberate hand-kept copy (`opencode/docs/divergence-register.md:18-20`). The sentence needs rewording, not just the table's removal.
- **Ports**: OpenCode has no Blocked-on-failure counterpart (its board is deferred; board-conventions is not vendored). Register row 33 concerns the handoff skill's "no status field" passage, which does not change, so it stays accurate. `codex/docs/specs/GPTA-1.md:57,79` says the transition "has never fired" and is not part of parity - still true. Nothing is written under `opencode/` or `codex/`.
- **The steward eval expects a project**: `claude/evals/fleet-steward/rubric.md:13` (FS01c) wants filing "under the "Coder Fleet" project". The prompts do not mention it; `baseline.json` is unset, so no baseline moves.
- **A fresh worktree has no `claude/coder-fleet/board/node_modules`** (gitignored), so check-all's board step runs `bun install --frozen-lockfile`.

## Agent routing

Every phase goes to `coder`: `lead.md` step 2 routes any phase of a multi-phase plan there. `tech-writer` cannot help (Write only, no Edit, no Bash, no git, cannot reach `claude/`); `scripter` is excluded by the same multi-phase rule.

Phases 1-5 share one `coder` run, one worktree, one branch, one commit per phase, so the branch stays continuous without the lead shuttling commits between worktrees. After the run, `review-round` over the branch, with `fix: true` if it comes back with blocking findings; `refuter` against the change if the review lists the gates under Unverified.

Before the spawn the lead calls `task_focus CF-8`. The branch is cut from local `main`, which is ahead of origin by board commits, so the CF-6 and CF-8 task files travel with the PR.

## Phase 1 - delete the dormant branch, test first

**Goal**: the hook reads no status field and never writes Blocked; the handoff check, the `Blocker:` -> Blocked by human route and every card comment behave exactly as before.

**Failing test first**, `claude/evals/lib/board-hook-contract.sh:207-216`. Keep the `R15` label. Replace `stop-status-honest` with two cases, both driving `board-subagent-stop.sh` with `agent_type:"coder-fleet:scout"`:
- `stop-status-failure-ignored`: payload `status:"failure"`, `last_assistant_message:"I gave up."`; assert `RC -eq 2` and the log does not contain `finished with status`. Red today (takes the Blocked branch, exits 0).
- `stop-completion-reason-ignored`: payload `completion_reason:"cancelled"` with a valid no-blocker handoff; assert `RC -eq 0` and the log contains `succeeded with no blockers`. Red today (logs `finished with status cancelled`).
- Keep the header note at line 14 `(no status, no completion_reason)`; optionally reword the stale "treated the absent status as success" comment at line 225.

Run `bash claude/evals/lib/board-hook-contract.sh -v` and confirm both new cases FAIL before touching the hook.

**Change** `claude/coder-fleet/hooks/board-subagent-stop.sh`:
- Delete 268-280 (the comment block and `status_raw`).
- Delete 297-305 (the `case`, including both "no status field" and "unrecognised status" log lines).
- Delete 312 `BOARD_RUN_STATUS` (open question 1).
- Delete 324-342 (the failure/cancelled branch writing Blocked).
- The "2. Successful run:" comment at 344 loses its number and the word "successful".
- Header item 1 (4-16) is rewritten to describe only the Blocked by human move and the comments.
- The comment above `extract_section` (184-189) loses its failure-path reasoning. The function body is untouched.

**Also**: `claude/evals/lib/handoff-parity.sh` - drop `status:"success"` from line 61 and "of a successful SubagentStop" from line 10.

**Verify**: `bash claude/evals/lib/board-hook-contract.sh -v`; `bash claude/evals/lib/handoff-parity.sh`; `bash claude/evals/lib/handoff-extractor-parity.sh`; `grep -nE 'status_raw|completion_reason|\$status\b|BOARD_COL_BLOCKED"' claude/coder-fleet/hooks/board-subagent-stop.sh` returns nothing. A leftover `$status` is unbound under `set -u`: the hook exits 1 and parity shows `error(1)`.

## Phase 2 - the prose about the Blocked route

**Goal**: every document says `TaskCompleted` is the only writer of Blocked. No test for prose; verification by grep.

- `claude/coder-fleet/skills/board-conventions/SKILL.md:31` (body only, frontmatter untouched): the Blocked row becomes `Waiting on something that is not the human - a build, an API, another item, or a failing suite` | `` `TaskCompleted`, when tests fail or a strict gate has no result ``.
- `claude/coder-fleet/hooks/README.md`:
  - 103: drop "the `status` field the harness sends".
  - 108-109: delete the two SubagentStop Blocked rows.
  - 113: delete the sentence.
  - 117-121 "Two things worth knowing": drop the failure-path sentence from the `- None` bullet; delete the "failure path reads a handoff nobody validated" bullet.
  - 169: the matcher's cost becomes "a non-fleet subagent's handoff is never read: no `Blocker:` reaches the human queue and no comment lands".
  - 195: replace the "failed or cancelled run" tolerance with "nothing tells the hook a run failed or was cancelled (item 15), so every typed stop that carries a message is checked".
  - 305-321: drop `status:"success"` from the four jq examples.
  - 368: item 8 loses "on success only".
  - 387: item 15's third consequence becomes "reads no status; the dormant Blocked-on-failure branch was deleted in v0.25.1; see `docs/limits.md`". It currently calls `Blocker:` "the route to Blocked", which is wrong - it routes to Blocked by human.
  - Item 19 needs nothing.
- `claude/coder-fleet/hooks/hooks.json:2`: "SubagentStop writes Blocked by human and enforces the handoff format". Check with `jq . claude/coder-fleet/hooks/hooks.json`.
- `docs/fleet-design.md:145`: the Blocked row's who-moves-it cell becomes `` `TaskCompleted`, when tests fail or a strict gate has no result ``; the dormant-route sentence goes.
- `docs/limits.md:7`: the entry stays (the gap is real). "The read is kept for forward compatibility" becomes "the hook reads no status; the dormant branch was removed in v0.25.1"; correct the route to Blocked by human; keep the `agent_transcript_path` sentence.

**Verify**: `grep -rnE 'status failure|failed or cancelled|forward compat|finished with status' claude/coder-fleet docs/fleet-design.md docs/limits.md`. The only acceptable hits are unrelated: compound skill line 15, handoff skill lines 35 and 57, and the SubagentStart `Board-Item:` note at README 42.

## Phase 3 - design sections 3, 7 (To do) and 8

- `docs/fleet-design.md:19-47`: keep the heading and the first paragraph's account of where the vocabulary comes from. Its last sentence becomes a pointer: the terms, meanings, mappings and the words dropped on purpose are in the `glossary` skill (`claude/coder-fleet/skills/glossary/SKILL.md`), preloaded into every agent, with the project rule generated from it (section 8). Delete the table (25-46) and the "Dropped on purpose" line (47); the skill carries it at line 41.
- `docs/fleet-design.md:143`: `| To do | Filed, not started | You, the lead filing a proposal, or \`fleet-steward\` filing its own scheduled sweep |`
- `docs/fleet-design.md:173`: only the last two sentences change: "Two copies exist in the plugin; only one is edited. This document carries none - section 3 points at the skill - because a copy someone has to remember to update is one more thing to drift. A port that re-points the Maps to column vendors its own copy and records it in that port's divergence register." Do not touch line 167 or line 175's "(section 3)".

**Verify**: `grep -c '^| Initiative |' docs/fleet-design.md` prints 0; `bash claude/scripts/gen-glossary-rule.sh --check`; `bash claude/evals/lib/roster-contract.sh`; `bash claude/evals/lib/instruction-file-contract.sh`.

## Phase 4 - drop the steward's project (CF-6)

- `claude/coder-fleet/agents/fleet-steward.md:28`: "...as a board item with `task_create`, quoting the source text and its URL." No other line and no frontmatter changes.
- `docs/fleet-design.md:251`: "...becomes a board item with the source quoted."
- `claude/evals/fleet-steward/rubric.md:13` (FS01c): "Files a board item rather than a change to an agent body." The rest stays. The PR says this follows the body change and is not a red eval turned green.
- **Migration checklist**: `coder` has neither the Skill tool nor the skill preloaded, so it reads `claude/coder-fleet/skills/migration-checklist/SKILL.md` and runs it over `fleet-steward.md`:
  - Run the three mechanical commands (YAML keys, dashes, hard wraps). The dash and wrap scans cover `docs/**`, which includes this plan.
  - Record checks 1-3, 5-8 and 14-19 with evidence.
  - 9-13 are not applicable (no model or effort change).
  - Check 4 is Unverified if `claude mcp list` cannot run in the worktree; the frontmatter did not change, so its result cannot have moved.
  - Output a findings table for the PR body.
  - `git diff -U0 main -- claude/coder-fleet/skills/board-conventions/SKILL.md` must show hunks only below line 5, so board-conventions needs no checklist run.

**Verify**: `grep -rn 'Coder Fleet' claude/coder-fleet/agents claude/evals docs/fleet-design.md` returns nothing (`displayName` in both manifests stays); `wc -l claude/coder-fleet/agents/fleet-steward.md` is under 60.

## Phase 5 - release and the one suite run

- Bump `0.25.1` in `claude/coder-fleet/.claude-plugin/plugin.json:5` and `.claude-plugin/marketplace.json:18`. Commit subject: `v0.25.1: SubagentStop reads no status, and the design points at the glossary`.
- Run the suite once, with a 300000 ms tool timeout:

```bash
bash claude/evals/lib/check-all.sh > "${TMPDIR:-/tmp}/cf-8-check-all.txt" 2>&1; echo "exit $?"
```

  Grep the captured file for `FAILED` and `Every deterministic check passes`. Never a second run.
- The lead pushes the branch and opens the PR. The body carries the checklist table, the check-all summary and the Unverified list, and ends with the Claude Code attribution line. Commits end with the `Co-Authored-By` trailer.
- After merge: the lead completes one task marked `[board:CF-8]` and one marked `[board:CF-6]`, and links the PR on both cards.

## Risks

- **Unbound `$status`**: a leftover reference makes the hook exit 1 under `set -u`. Caught by the Phase 1 grep and parity's `error(n)` column.
- **The new guard pins "status is ignored"**: a runtime that starts sending a real status will not get Blocked without a deliberate R15 edit. Intended; `docs/limits.md` says so.
- **A cancelled run could be told to re-emit**: if a runtime ever sent a cancelled run through SubagentStop with a malformed message, the hook would now exit 2. It is indistinguishable from a normal stop today anyway; README line 195's replacement names it.
- **Extractor parity is edit-brittle**: any change inside `extract_section` or `validate_handoff` breaks it. Phase 1 edits only the comments around them.
- **The instruction-file contract fails on any new, unwhitelisted mention of the other instruction-file name** anywhere in the repo, this plan included, and on any change to the pinned design lines 167 and section 10.
- **`bun install` in the worktree** needs network and time. If refused, the board step fails for an environmental reason only (the board package is untouched): record it as Unverified and let CI's run on the PR be authoritative.
- **The rubric edit looks like editing an eval to pass**: the PR says why.

## Resolved questions

1. Archive header: drop `BOARD_RUN_STATUS`; archives read `Status: not recorded`.
2. Section 8 wording: the port sentence goes in as written in Phase 3.
3. Blocked row: state both cases (failing tests, strict gate with no result); CF-8's AC #2 is amended to match.
4. Version: 0.25.1.
5. Steward smoke eval: run `claude/evals/run.sh fleet-steward` once on the branch after Phase 4. There is no baseline, so the score is recorded as the first one, not compared.
6. CF-6 closure: its own `[board:CF-6]` completion task after the merge.
