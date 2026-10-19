---
id: CF-65
title: Remove a merged worktree without asking the human
status: Done
assignee: []
created_date: '2026-09-29 01:14'
updated_date: '2026-09-29 01:22'
labels: []
dependencies: []
priority: Medium
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human 2026-09-29: "add in the right place that once a worktree has been merged and is not actively being used that it should be deleted. The user does not need to ask to remove them." lead.md already tells the lead to remove a coder's or scripter's worktree once adopted, but not that it does so without asking (the Invariants reserve deleting data for the human, which read as covering this), and not for worktrees the lead cut itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md says the lead removes every worktree whose work is merged and that nothing is using, its own included, with /coder-fleet:prune-worktrees and without asking the human, because the script removes only clean, unlocked, merged work; still six steps and under 60 lines
- [ ] #2 the prune-worktrees command says the lead runs it after each merge unasked
- [ ] #3 check-all green, version bumped and tagged
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-29 01:14
---
Starting 2026-09-29, ordered by the human. Built by the lead directly, a two-line change, so no SubagentStart moves this card; this comment is the record. The rule was applied at once: prune-worktrees.sh removed the two merged CF-64 worktrees (cf-64-build, cf-64-cutoff-honesty) unasked.
---
<!-- COMMENTS:END -->
