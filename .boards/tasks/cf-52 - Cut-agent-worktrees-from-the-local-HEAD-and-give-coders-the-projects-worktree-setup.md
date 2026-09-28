---
id: CF-52
title: >-
  Cut agent worktrees from the local HEAD, and give coders the project's
  worktree setup
status: To Do
assignee: []
created_date: '2026-09-28 01:36'
labels: []
dependencies: []
priority: High
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #25, from the Fathom Models post-mortem (fathom docs/runs/2026-09-28-lead-models-live.md, finding 7). Every agent worktree that week was cut from origin/main nine merges behind the unpushed local main, and every coder brief carried the fast-forward and node_modules steps by hand. Found in triage on 2026-09-28: Claude Code 2.1.283 defines the setting worktree.baseRef as "fresh" (default, origin/<default-branch>) or "head" (the current local HEAD), so the base is a setting the fleet ships, not a hook. Dependencies are a separate problem, and project-specific, so they live in each project's AGENTS.md, not in the plugin. The human chose to handle both in this item.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/project-settings.json sets worktree.baseRef to "head", and /init writes it
- [ ] #2 /kickoff detects a project on the default and offers the change, changing nothing without the human's yes
- [ ] #3 a live run shows a type-isolated coder spawn and a review-round worktree both cut from local HEAD with local main ahead of origin, recorded in docs/limits.md, which drops or rewrites its fresh-baseRef entry; hooks/README.md item 18 updated to match
- [ ] #4 lead.md says in one clause that agent worktrees cut from the lead's current HEAD, so a spawn from a feature branch stacks on it
- [ ] #5 templates/AGENTS.md gains a worktree setup section (how a fresh worktree gets its dependencies, or none needed), /init asks for it, and coder.md tells coders to follow that section before building
- [ ] #6 check-all green, migration-checklist run on coder.md and lead.md, version bumped and tagged
<!-- AC:END -->
