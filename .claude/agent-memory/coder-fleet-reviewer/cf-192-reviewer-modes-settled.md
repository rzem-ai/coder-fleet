---
name: cf-192-reviewer-modes-settled
description: What CF-192 settled about the reviewer's Modes header, the break-mode clock and the progress-log append, so a later review does not re-raise them; plus the emptied-test-file trap found there
metadata:
  type: project
---

Settled by the lead's card comments on CF-192 (2026-11-10), not findings to re-raise:
- An unreadable or malformed brief is capped as break mode (fail closed) and scoped as review. A review-only run is uncapped only when its brief reads cleanly.
- The mode comes only from a `Modes:` line in the first five lines of the subagent transcript's first user message, recorded once in `<state>/modes/<agent_id>` and sticky.
- A same-user well-formed forgery of that record or of the transcript, and a deleted or garbled clock file, are recorded residual gaps in docs/limits.md. No further security rounds on the record.
- `disabledAgents` entries naming refuter or evaluator are ignored quietly. The reviewer cannot be disabled.
- Lead ruling 2026-11-12 (fix round 1): break mode's fragment-based indirect deny (cd/glob/$/~ beside `state`, `.local`, `coder-fleet`) is gone on purpose. Only the full protected paths and fixed tails like `coder-fleet/modes` are refused, and each deny names the matched path. A `cd` plus a relative path into the state dir is the recorded limits.md gap, not a finding.

- Merge with CF-183.2 (f0c809f, reviewed 2026-11-12, approved): in enforce-agent-scope.sh the retired-type deny comes first, then the `--memory` allow (main's registered-worktree rule), then the reviewer protected-path deny, then the mode rule. So memory is mode-independent, and a protected path can never be a memory path. memory-state.py has no role list; it derives the directory from agent_type.

Verified 2026-11-11 on a live transcript (`~/.claude/projects/<proj>/<session>/subagents/agent-<id>.jsonl`): line 1 is `type:"user"` with the spawn prompt as a plain string, `Board-Item:` first. No CLAUDE.md or skill text sits before it, so a `Modes:` line on line 3 is inside the window.

Trap found in that review: `claude/evals/lib/agents-command-contract.sh` was truncated to 0 bytes but kept executable, and check-all printed `agents-command: ok (0.0s)`. suite-coverage counts it as covered. **How to apply:** in any diff whose stat shows a contract file with only deletions, run `wc -l` on it, and treat a check-all section reporting 0.0s as suspect.

The installed plugin governing a review can be older than the branch (0.50.0 governed the 0.51.0 review), so the reviewer's own hook behaviour says nothing about the branch's hooks. See [[gate-run-quirks]].
