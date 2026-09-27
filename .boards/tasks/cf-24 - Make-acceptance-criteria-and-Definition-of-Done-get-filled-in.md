---
id: CF-24
title: Make acceptance criteria and Definition of Done get filled in
status: To Do
assignee: []
created_date: '2026-09-27 03:08'
updated_date: '2026-09-27 03:14'
labels: []
dependencies: []
references:
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/hooks/board-task-completed.sh
priority: High
type: feature
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-09-27: "Acceptance Criteria and Definition of Done never appear to be filled in by the agents."

Cause, as the lead sees it: nobody owns either field. Most fleet agents have no board tools (design section 7 scopes the board server to spec-writer, fleet-steward and the lead), board-conventions says who writes columns but not who ticks acceptance criteria, and no project Definition of Done defaults exist, so every item is created with none. The only acceptance criteria ever ticked were CF-8's and CF-6's, by the lead by hand after merge (2026-09-27).

Needs a spec: who ticks an acceptance criterion and on what evidence (the lead after verification, an agent's handoff naming criteria met, a hook reading such a line, or TaskCompleted); what the project's default Definition of Done is and who checks it; whether items created by the lead or steward must carry acceptance criteria; how this interacts with columns being hook-owned (ticking a criterion is a field edit, not a column write).
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-09-27 03:14
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Drafted `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-24.md`: problem, what the repo offers today, non-goals, 11 acceptance criteria, the contract tests that change, overlap with in-flight work, and questions Q1 to Q12.
- Drafted `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-25.md`: problem, what the board fork can show today, non-goals, 11 acceptance criteria, the contract tests that change, overlap with in-flight work, and questions Q1 to Q11.
- Checked against the repo: every agent's tools line; the lead's board tools; `board.sh` making only status and comment writes; the CLI having no Definition of Done flag; the fork applying Definition of Done defaults only when an item is created; the order sections render in each view; and `check-all.sh` skipping the board tests when bun is missing.
---
<!-- COMMENTS:END -->
