---
id: CF-52
title: >-
  Cut agent worktrees from the local HEAD, and give coders the project's
  worktree setup
status: In Progress
assignee: []
created_date: '2026-09-28 01:36'
updated_date: '2026-09-30 08:33'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/25'
  - claude/coder-fleet/templates/project-settings.json
  - docs/limits.md
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 08:33
---
The human ordered this built on 2026-09-30 ("fix the github issues", #25). Split: the coder builds #1, #2 and #5 now, and drafts the docs/limits.md wording for #3. The lead does #3's live run after merge, because it needs real spawns. #4's lead.md clause lands in the serial lead.md track after CF-51. #6's version bump is batched into a joint release.
---
<!-- COMMENTS:END -->
