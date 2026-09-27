---
id: CF-31
title: Reserve Blocker lines for questions only the human can answer
status: To Do
assignee: []
created_date: '2026-09-27 03:22'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/reviewer.md
  - claude/coder-fleet/agents/refuter.md
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/workflows/review-round.js
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
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
- [ ] #1 reviewer.md and refuter.md say must-fix findings and surviving mutants are reported in the verdict or findings (and Propose item: where a fix round is needed), never as Blocker:, which is reserved for a question only the human can answer
- [ ] #2 The handoff skill states the rule with one worked example of a must-fix review finding that is not a Blocker
- [ ] #3 review-round.js no longer asks for or reads refuter survivors or reviewer defects from Blocker: lines, and still starts a fix round on them, proven by workflow-logic tests that fail first
- [ ] #4 migration-checklist findings for both bodies in the PR; check-all.sh passes; version bump and release tag
<!-- AC:END -->
