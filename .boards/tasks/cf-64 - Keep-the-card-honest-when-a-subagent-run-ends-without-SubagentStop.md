---
id: CF-64
title: Keep the card honest when a subagent run ends without SubagentStop
status: In Progress
assignee: []
created_date: '2026-09-28 23:57'
updated_date: '2026-09-29 12:12'
labels: []
dependencies:
  - CF-12.1
priority: High
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human 2026-09-29, from the CF-12.1 findings (docs/findings/CF-12.1-claude-code-behaviours.md): a run cut off by maxTurns mid-task never ended with a handoff (4 of 4), and SubagentStop did not fire (0 of 4, against 4 of 4 for runs that finished normally). That was measured inside a nested sandbox; background dispatch and sandbox-plus-cap remain open explanations. When SubagentStop does not fire there is no handoff gate, no card comment and no move to Blocked, so the card sits in In Progress saying nothing. No fleet agent sets maxTurns today, but CF-12's editors will (maxTurns 15), and any run that is cut off (a crash, an exhausted budget) may hit the same gap. lead.md already treats a missing handoff as a failed run (Invariants), but tells nobody on the board. The response depends on the E2b repeat outside the sandbox (the findings give the command): B, the hook never fires, means lead detection plus a limits entry; A1, it fires and the gate's exit 2 gets a handoff, means record it; A2, it fires but the agent cannot answer past the cap, means a SubagentStop branch that comments "stopped at its turn cap".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 E2b is repeated outside the nested sandbox, and whether SubagentStop fires at the cap is recorded in the findings with the command and the evidence
- [ ] #2 lead.md: when a spawn returns without a four-heading handoff, the lead comments on the card that the run ended without one and what it will do next, never leaving the card silent; still six steps, under 60 lines
- [ ] #3 the outcome's own fix lands: a docs/limits.md entry (B or A1), or a board-subagent-stop.sh branch for a turn-cap transcript with a contract case written red first (A2)
- [ ] #4 check-all green, migration-checklist run over lead.md, version bumped and tagged
- [ ] #5 SubagentStop writes a per-agent stopped marker, and a new PostToolUse hook on the Agent tool comments on the bound card when a foreground spawn returns with no marker (naming the turn cap when the runtime says so), never moving a column; contract cases written red first, bash 3.2 included
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-29 00:03
---
E2b repeated outside the nested sandbox on 2026-09-29, Claude Code 2.1.283, in a scratch area from the CF-12.1 harness. Foreground runs, the parent told to wait: 3 of 3 runs cut off by the 3-turn cap produced no SubagentStop (fg2, fg3, fg4), against 2 of 2 captures for runs that finished on their own (E2a, fg1). The default E2b run was backgrounded by the runtime and is excluded as confounded. Outcome B: no hook fires at the cap, sandbox or not. New finding: PostToolUse fires in the parent when a foreground Agent call returns. Its payload carries tool_response.agentId, agentType, status "completed" and a content note "this agent stopped at its N-turn limit before finishing ... PARTIAL output ... Send the agent a message (SendMessage) to let it continue". So the fix is machinery, not only lead prose: SubagentStop writes a per-agent stopped marker, and a PostToolUse hook on the Agent tool comments on the bound card when the returned agent has no marker (turn cap, or cut off otherwise), moving no column. Background spawns report only at launch, so lead.md keeps the rule for those and limits.md records the gap. The spike self-test also had a bug (the main checkout root resolved to $HOME from the main checkout, creating ~/.claude/worktrees/some-session, since removed); fixed on cf-64-cutoff-honesty (1a064a3).
---

author: @SubagentStop
created: 2026-09-29 00:23
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a1c52f9600adcd29c`, branch `cf-64-build`, cut from `origin/cf-64-cutoff-honesty`. `git rev-parse --git-common-dir` confirmed a linked worktree, and it was clean before I started.
- `991de33` "Add R21 contract cases for a run that ends without SubagentStop": 12 cases in `claude/evals/lib/board-hook-contract.sh`, committed red. The run showed 133 passed, 12 failed (all 12 new), exit 1.
- What makes each new case fail: `return-cap-comments` if the note regex or the comment is removed; `return-no-stop-comments` if the generic comment is removed; `return-after-stop-silent` if the marker check is ignored (mutant 2); `return-unbound-silent` and `return-no-record-silent` if the binding check is dropped; `return-not-completed-silent` if the status guard is dropped (mutant 3).
- More cases: `stop-exit2-leaves-marker` and `stop-untyped-leaves-marker` fail if the marker is only written on the success path (mutant 1); `return-dry-run-reports` if the dry-run log line is removed; `return-non-fleet-silent` if the fleet filter is dropped (mutant 4); `return-bad-input-exits-0` if the JSON-object guard is removed; `return-registered` if the `hooks.json` entry is removed.
- `c9daae7` "Comment on the card when a fleet agent returns without SubagentStop": new `claude/coder-fleet/hooks/board-agent-return.sh`, plus `state_mark_stopped` and `state_agent_stopped` in `hooks/lib/board.sh`. The marker file is `sessions/<sid>/agents/<aid>.stopped`.
- In the same commit, `board-subagent-stop.sh` writes the marker straight after reading `agent_id`, before every branch that can exit. `hooks.json` registers the new hook on PostToolUse, matcher `Agent`, timeout 20 s.
- `6d92d95` "Name 2.1.284 as the CLI the cap cut-offs were measured on".
- `792058a` "Document the stopped marker, the return hook and the cap measurement". The `lead.md` invariant is extended; it still has six numbered steps, four H2 sections and 48 lines.
- In the same commit, the hooks README gains a hook table row, the state tree entry, a card-comment row, the section "When a run ends without SubagentStop" and decision item 23. `docs/limits.md` gets a new entry on the cut-off gap and background spawns. The findings doc gets a dated section, "2026-09-29: E2b outside the sandbox, and the Agent tool's PostToolUse payload", with a per-run table.
- Contract results: baseline before any change 133/0; after the fix 145/0, exit 0. With `/bin/bash` 3.2.57 first on PATH, also 145/0, exit 0. A scratch script confirmed that `env bash` resolved to 3.2.57 under that PATH.
- Mutation checks, each on a restored tree, restored with `cp` and confirmed with `cmp` and a clean `git status`. All four were killed: marker written only on the success path (exit 1, 2 cases failed); return hook ignores the marker (exit 1, 2 failed); return hook comments on a non-completed status (exit 1, 1 failed); fleet-type filter dropped (exit 1, 1 failed).
- `bash claude/evals/lib/check-all.sh`, run once: exit 0, "Every deterministic check passes". That includes the board contract's live pass against bun.
---

author: @SubagentStop
created: 2026-09-29 00:31
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes on one mechanical item (the version bump). The code and docs are otherwise sound, with one follow-up needing a decision.
- Examined the full diff `origin/main...HEAD` (6 commits, 10 files), the stop hook's exit paths, `lib/board.sh` state and comment helpers, the R21 contract cases, the start hook's binding, `lead.md` structure, the agent frontmatter for `maxTurns`, and memory on prior hook decisions.
- must fix: claude/coder-fleet/.claude-plugin/plugin.json:5 - no version bump (and none in .claude-plugin/marketplace.json), so no install receives the new hook or the marker
- low: claude/coder-fleet/hooks/board-agent-return.sh:134 - seven jq forks (plus one at :171), each re-parsing the full payload, on every Agent return in every project; collapse to one @tsv call and filter before reading content
- low: claude/coder-fleet/hooks/board-agent-return.sh:201 - a disabled board is logged as "dry run"
- low: claude/coder-fleet/hooks/hooks.json:68 - 20 s timeout is below the two 10 s board calls plus jq; the stop hook uses 30
- low: docs/findings/CF-12.1-claude-code-behaviours.md:345 - "not directly observed" contradicted by the paragraph at :347
- low: claude/coder-fleet/hooks/README.md - "every path" / "first thing" overstates it; jq missing or unparseable input exits before the marker
- low: claude/evals/lib/board-hook-contract.sh:1203 - return-unbound-silent never checks that an unbound record exists, and no R21 case asserts empty stdout
---

author: @SubagentStop
created: 2026-09-29 00:45
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a1c52f9600adcd29c`, branch `cf-64-build`. I ran `git merge --ff-only cf-64-cutoff-honesty` first, which brought in `c222304`.
- `268877d` "Hold the return hook to the cap note beating the stopped marker": adds `return-cap-beats-marker` (the gate rejects a handoff with exit 2, then the return carries the cap note: expect one cap comment). Committed red: 146 passed, 1 failed (that case), exit 1.
- Same commit, item 7: `return-unbound-silent` now checks that the unbound record file exists with an empty `page_id` before the return. All 11 R21 return runs go through `r21_run_return`, and `return-stdout-silent` fails if any of them writes to stdout.
- `55118e1` "Let the cap note beat the stopped marker, and read the return in one jq" (items 1 to 3), part one: the four filter fields come from one jq call, joined with the ASCII unit separator (a tab would let `read` merge empty fields). The filters then run in order: status, fleet type (the hooks.json jq), binding. A second jq reads cwd and content only once a comment is possible.
- Same commit, part two: the cap note gets its comment whether or not there is a marker; the marker only suppresses the generic comment. A disabled board is now logged as the board being off, not as a dry run; new case `return-board-off-says-off`.
- jq process counts, measured with a counting shim on PATH: an async return starts 1 (was 8), and a completed return that doesn't reach a comment starts 2.
- Same commit: `return-after-stop-silent` fed the cap note after a normal stop, which your decision now correctly comments on. A normal finish never carries the note, so the case now returns `## Done` content.
- `c47b7cb` "Give the return hook the stop hook's 30 second timeout" (item 4).
- `e6f30f2` "Document the cap note beating the marker, and where the marker is written" (items 5 and 6), README part: the hook table, state tree, marker bullet and decision 23 now say "on every path after the ids are read", and name jq missing and a payload with no `agent_id` as exits before it. The return bullet describes the cap-beats-marker rule, the one-jq read and the board-off log.
- Same commit, the rest: `docs/limits.md` and the findings "Consequence" line match the new rule. In the findings, the stale "Not directly observed" sentence is gone and the session_id measurement is added.
- Contract after the fix: 148 passed, 0 failed, exit 0. Under bash 3.2 (the version check script printed 3.2.57): 148 passed, 0 failed, exit 0.
- Mutation A, the marker check put back in front of the cap note: killed by `return-cap-beats-marker` (147/1, exit 1).
- Mutation B, the hook echoes JSON to stdout: killed by `return-stdout-silent` (147/1, exit 1).
- After each mutant I restored with `cp`, confirmed with `cmp`, and checked that `git status` was clean.
- `bash claude/evals/lib/check-all.sh`, run once: exit 0, "Every deterministic check passes."
---
<!-- COMMENTS:END -->
