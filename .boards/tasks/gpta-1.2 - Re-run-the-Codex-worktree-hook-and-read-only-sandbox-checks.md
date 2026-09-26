---
id: GPTA-1.2
title: Re-run the Codex worktree-hook and read-only sandbox checks
status: To Do
assignee: []
created_date: '2026-09-25 10:38'
updated_date: '2026-09-25 12:07'
labels: []
dependencies:
  - GPTA-1.1
references:
  - docs/findings/GPTA-1.1-codex-hooks.md
  - docs/plans/GPTA-1.1.md
parent_task_id: GPTA-1
type: spike
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to GPTA-1.1, blocked on the Codex usage cap until 29 Sep 2026 20:48 AEST. Using the committed harness in scripts/spike/codex-hooks/ (README has the /hooks trust step): (Q6) do user-level hooks fire when codex runs inside a git worktree, and do project-level ones (#27133); (Q7) re-confirm a custom agent's sandbox_mode = "read-only" is not applied, with the prompt forbidding the parent from writing the file. Hooks in the gpta-1.1-r2 scratch home are already trusted, but the scratchpad is session-scoped, so a new session re-runs setup.sh and the human trusts once more. Append results to docs/findings/GPTA-1.1-codex-hooks.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Q6: user-level hooks fire (or not) when codex runs inside a git worktree, and project-level ones (#27133), with evidence
- [ ] #2 Q7: a custom agent's sandbox_mode read-only is re-checked with the prompt forbidding the parent from writing
- [ ] #3 Editing a trusted hook's script (not its hooks.json entry) does or does not put it back to pending in /hooks
- [ ] #4 A filesystem requirements.toml managed hook runs without an interactive trust step on 0.156.1 (spec Q22)
- [ ] #5 The Stop hook payload carries last_assistant_message (spec Q6)
- [ ] #6 A PreToolUse deny takes effect on a Bash call and on an MCP call (criterion 14, Q16)
- [ ] #7 The approval setting that lets a subagent's MCP tool call run under approval_policy never is identified (criterion 12)
- [ ] #8 The committed register-mcp-stub.sh and run-applypatch-mcp.sh run once as committed
- [ ] #9 The harness has a committed scratch-only regression script replaying the GPTA-1.1 refuter attacks A to G against a stub codex, and it passes
- [ ] #10 A refuter re-run against the hardened harness finds no way to delete or overwrite a file the harness did not create
- [ ] #11 The hardened harness is merged to main
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-25 10:46
---
Scope extended from the GPTA-1 spec revision (spec-writer, 25 Sep) and the GPTA-1.1 round 2 review. Each check below is one a GPTA-1 default now rests on. All run after the 29 Sep quota reset.
---

author: lead
created: 2026-09-25 12:07
---
Harness hardening added (human decision, 25 Sep 2026 22:06 AEST). The GPTA-1.1 harness stays on branch worktree-agent-af83b7d1806f0e868 at 9947a27, unmerged: a refuter broke its destructive-path guards six ways (A: failed ls -A read as empty; B: trailing newline in the path resolves to a sibling; D: teardown's git worktree remove --force follows a symlinked scratch-worktree and deletes a foreign worktree; E: run scripts follow symlinked logs/, state/, scratch-repo and output files; F: ~/.codex guard skipped when HOME is unset; G: setup writes through a symlinked codex-home or scratch-repo). Before any Codex run, harden it test-first: commit a scratch-only regression script replaying attacks A to G against a stub codex, then fix until it passes, then a refuter re-runs it. Only then merge the harness to main.
---
<!-- COMMENTS:END -->
