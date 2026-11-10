---
id: CF-192
title: 'Fold refuter and evaluator into reviewer, one checking agent'
status: To Do
assignee: []
created_date: '2026-11-10 13:15'
updated_date: '2026-11-10 13:16'
labels: []
dependencies: []
priority: High
type: enhancement
ordinal: 322000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-11-11: "ther is a reviewer agent, a refuter agent, and an evaluator agent - it is too much. fold into one"

Decisions the human gave in the session (AskUserQuestion, 2026-11-11):
- Name: keep `reviewer`; `refuter` and `evaluator` go.
- Shape: one agent, one body; the lead's brief picks which modes a spawn runs (review the diff and run the gates always; break the change; use the running product).
- Mutation testing: kept only for authentication and credential paths and the harden phase, as today's build-phase rule already does.
- Contract: dropped. No contract-before-build step; the product check grades straight against the card's acceptance criteria.

Names reach 79 files across both ports, including agent-clock.sh, enforce-agent-scope.sh, the disabledAgents switch, the build/harden phase rule, review-round's lanes, the glossary, evals and fixtures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Claude Code plugin ships one checking agent, `reviewer`; the `refuter` and `evaluator` definitions, evals and fixtures are gone, and the roster (claude/README.md table, SubagentStop matcher, evals, docs/fleet-design.md) agrees on the smaller fleet
- [ ] #2 The reviewer body has modes the lead's brief selects: review (read the diff, run the declared gates read-only) on every spawn; break (mutation testing) only on an authentication or credential path, or in the harden phase; use (run the product against the card's acceptance criteria) where AGENTS.md has an App start: line
- [ ] #3 No contract step remains: the lead, glossary, review-round and docs carry no `Contract: <n> checks` comment or contract-mode spawn, and a product check grades against the card's acceptance criteria
- [ ] #4 A break-mode reviewer run keeps a hard wall-clock cap enforced by a hook, with a contract test for it, and review-mode runs are not capped by it
- [ ] #5 review-round spawns the merged reviewer instead of separate refutation and evaluation lanes, and its workflow logic tests pass
- [ ] #6 A project whose .claude/coder-fleet.json lists refuter or evaluator under disabledAgents still loads and runs without error, and /coder-fleet:agents offers neither name
- [ ] #7 bash claude/evals/lib/check-all.sh passes, and the migration-checklist skill has been run over every changed agent body and skill
- [ ] #8 The release bumps the version in plugin.json and marketplace.json
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
created: 2026-11-10 13:16
---
Sub-issue 1 of 2: started. Done still needs: criteria 1-8, and CF-192.1 (OpenCode port).

Done: nothing yet - the human can't see any change.
Not done: the plugin still ships reviewer, refuter and evaluator as three agents. A coder is building the fold on the Claude Code side; the OpenCode port follows in CF-192.1 once that merges.

Lead defaults the coder needs that no criterion says: the lead's own body (claude/coder-fleet/agents/lead.md) is rewritten to route to the one reviewer; `disabledAgents` entries naming refuter or evaluator are ignored quietly rather than erroring; disabling `reviewer` is not offered, since every change needs an independent gate run.
---
<!-- COMMENTS:END -->
