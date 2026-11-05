---
id: CF-177
title: Bring the lead's shipping orders and three Fathom lessons into the plugin
status: To Do
assignee: []
created_date: '2026-11-04 23:01'
updated_date: '2026-11-05 00:21'
labels:
  - lead
  - memory
dependencies: []
ordinal: 301000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 5 November 2026: "bring the lead's standing orders and three lessons from today's Fathom session into the coder-fleet plugin, where they are generic."

Alex's shipping orders, 4 Nov: "you are to commit and push, create the PR, approve and merge the PR if the CI passes, and then deploy". 5 Nov: "Releases all need tags".

Fathom carries most of this in its own lead override (`.claude/agents/lead.md`, How you work rule 9 and Rules for this project) and its AGENTS.md (Where work lives, and the Gates paragraph on testing in production). The plugin takes the generic part and leaves Fathom-only details out: host names, its deploy script, its review clone and the paid model's name.

Lessons from 5 Nov: the lead asked "push and open?" though the orders covered it, because the harness had refused an earlier `gh issue create`; and copying a worktree's `.claude/agent-memory/` back to the main checkout is refused by the Claude desktop app's own PreToolUse hook (not a coder-fleet hook) from a session in that worktree, while the directory is tracked in git and can ride the PR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shipping follows the project's orders: the lead takes each of commit and push, draft PR, one review with at most one fix round and a narrow review of commits after an approval, mark ready and merge on GitHub only when the review approved, CI is green and GitHub reports it mergeable, tag vMAJOR.MINOR.PATCH (next minor for a change a person sees, else next patch) and push the tag, deploy that release, then remove the worktree and branch - each only where the project's AGENTS.md Where work lives grants it, the deploy command included; a merge that changes nothing the product runs is neither tagged nor deployed; a project that grants none keeps today's behaviour
- [ ] #2 The lead does not ask before a step the orders cover: a refusal of one covered step is reported and asked about once, and does not make the lead ask before later covered steps
- [ ] #3 Memory written in a worktree is committed on its branch and reaches main through the PR, never copied back into the main checkout's .claude/agent-memory/, wherever the plugin or its templates speak of it; a worktree with unsaved work, memory that missed a PR included, is never removed but reported
- [ ] #4 Whether a paid run (a cloud model or metered service) needs asking is read from the project's AGENTS.md; the plugin names no model, and a run the project does not allow needs the human's word
- [ ] #5 Unchanged: an unexpected change in the main checkout is the human's own work, never reverted or discarded, and committed only in its own commit naming what went in, wherever that rule stands
- [ ] #6 Any port carrying the same rules (the OpenCode lead and template) says the same, with a divergence-register row where it differs
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-04 23:01
---
Sub-issue 1 of 1: started. Done still needs: criteria 1 to 6.

Done: nothing a project can use yet. Not done: the lead still has no shipping orders, memory written in a worktree has no rule, and paid runs are not read from AGENTS.md. Building in worktree .claude/worktrees/cf-177-shipping-orders on branch cf-177-shipping-orders.
---

author: lead
created: 2026-11-04 23:11
---
Sub-issue 1 of 1: started. Done still needs: a passing lead eval, review, and the merge of PR #115 for criteria 1 to 6.

Done: the plugin's lead (claude/coder-fleet/agents/lead.md steps 5 and 6, first invariant), both AGENTS.md templates (Shipping: and Paid runs: lines) and the OpenCode lead now carry the shipping orders, the no-repeat-asking rule, worktree memory riding its branch and per-project paid runs, on branch cf-177-shipping-orders in draft PR #115 at v0.44.0. The deterministic suite passes. Not done: none of it reaches a project until #115 merges; claude/evals/run.sh lead fails (three prompts end without the four-heading handoff, rubric 68%, no baseline), and a gates-only run of main's lead is being made to see whether that failure predates this change.
---

author: lead
created: 2026-11-04 23:17
---
The lead eval failure is now its own card, CF-178, filed on the human's word on 5 November 2026. It fails the same way on main, so CF-177's eval condition is met once CF-178 makes the eval pass. Until then a passing eval can't be shown for this card.
---

author: lead
created: 2026-11-05 00:07
---
Sub-issue 1 of 1: started. Done still needs: a lead eval at or near the baseline, review, and the merge of PR #115.

Done: the branch is up to date with main (CF-178 merged in, no rebase), released as v0.46.0 at 5a34b7c, the suite passes, and every lead eval gate passes. Not done: the lead eval rubric scores 69% against the 81% baseline (REGRESSED), while main scores 77% (ok) in the same session. None of the misses names the new rules, but one run each can't show whether the gap is the change or variance, so this is a failure until a rerun shows otherwise. Nothing reaches a project until #115 merges.
---

author: lead
created: 2026-11-05 00:21
---
Sub-issue 1 of 1: started. Done still needs: review and the merge of PR #115.

Done: three lead eval runs on v0.46.0 (5a34b7c) pass every gate and score 69%, 81% and 77% against the 81% baseline, with the last two ok. Main scored 77% once, so the first 69% was variance, not a drop. The suite passes. Not done: nothing reaches a project until #115 is reviewed and merged, and it stays a draft until the human says so.
---
<!-- COMMENTS:END -->
