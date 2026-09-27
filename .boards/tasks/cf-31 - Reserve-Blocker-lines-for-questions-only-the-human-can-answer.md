---
id: CF-31
title: Reserve Blocker lines for questions only the human can answer
status: To Do
assignee: []
created_date: '2026-09-27 03:22'
updated_date: '2026-09-27 04:26'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/reviewer.md
  - claude/coder-fleet/agents/refuter.md
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/workflows/review-round.js
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - docs/plans/CF-31.md
priority: High
type: bug
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pulled forward from CF-25 by the human, 2026-09-27 (GitHub issue #3 point 1). `reviewer.md:42` says "A defect that must be fixed before merge is a `Blocker:` line" and `refuter.md:48` says a surviving behaviour-changing mutation is a `Blocker:` line, so every request-changes review and every refutation with a survivor moves its item to Blocked by human for work the lead routes itself (CF-8 on 2026-09-27; Fathom FTH-001.12, fathom commit 7475a38). The `review-round` workflow depends on it: its refuter prompt (`review-round.js:836`) asks for survivors as Blocker lines and its result parsing (`:233`, `:851-861`) reads them. Change the reviewer and refuter bodies, the handoff skill (with a worked example of a finding that is not a blocker), and the workflow's prompts and parsing together, so Blocker: means only "the human must answer this before work continues". Takes over CF-23 AC7. CF-25 keeps the Actions for Human section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The handoff skill states the rule with one worked example of a must-fix review finding that is not a Blocker
- [ ] #2 migration-checklist findings for both bodies in the PR; check-all.sh passes; version bump and release tag
- [ ] #3 reviewer.md and refuter.md say a must-fix finding and a surviving mutant are reported in the findings and as `must fix:` / `survived:` Done bullets, never as Blocker: and never as Propose item:; Blocker: is reserved for a question only the human can answer
- [ ] #4 review-round.js asks for and reads refuter survivors from `survived:` Done bullets, not Blocker: lines, and still stops the round as refuted on them; a refuter Blocker gets its own stop, `refuter raised a blocker`; proven by workflow-logic tests that fail first
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 04:26
---
Plan docs/plans/CF-31.md approved by the human 2026-09-27 after a walkthrough, all ten open questions on the recommended answer. Card brought into line with the plan (the human's rule: the plan wins): AC1 and AC3 replaced - a must-fix finding is never a Propose item, and survivors stop the round as refuted rather than starting a fix round (they never did). One coder phase next.
---
<!-- COMMENTS:END -->
