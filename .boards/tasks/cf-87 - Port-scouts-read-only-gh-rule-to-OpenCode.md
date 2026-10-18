---
id: CF-87
title: Port scout's read-only gh rule to OpenCode
status: Done
assignee: []
created_date: '2026-09-30 05:56'
updated_date: '2026-10-18 04:02'
labels: []
dependencies:
  - CF-84
priority: Low
type: task
ordinal: 250000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-84, 2026-09-30. Once the Claude Code rule lands, carry scout's gh rule into opencode/coder-fleet/lib/scope.ts and opencode/coder-fleet/agent/scout.md: pair allowlist, only -R/--repo before the pair, GET-only api, no pager/browser/editor variables. Or record a row in opencode/docs/divergence-register.md with the reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The OpenCode scout allows the same gh pairs and denies the same forms, with invariant tests under opencode/test/, or a divergence-register row says why not
- [x] #2 The OpenCode invariant tests pass
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-18 03:55
---
Ticks on main, PR #91 (rzem-ai/coder-fleet), merged to main as e827588. #1: the OpenCode scout allows the same gh pairs and denies the same forms: opencode/coder-fleet/lib/scope.ts (readOnlyGh) and agent/scout.md, with the fleet's 24 allow and 76 deny cases from scope-hook-contract.sh in opencode/test/invariants/scope.test.ts and a merged-ruleset case in rulesets.test.ts. #2: unit 59/59 and live 14/14, and in CI. DoD #1 by CI deterministic green on the PR head 7b12fef, which ran check-all.sh and check-slow.sh. DoD #2: No fleet reviewer or refuter round ran: the session worked under the human's order to finish the port without stopping, the Codex review bot reviewed the PR and its one finding was fixed in 4c5c35a, and the human merged it. DoD #3 not applicable: no Claude Code agent body or skill frontmatter changed, and the port's migration-checklist is deferred with fleet-steward. DoD #4 not applicable: nothing under claude/coder-fleet/ changed, and the version is the Claude Code plugin's. DoD #5 by the register's scout read-only gh row. DoD #6 not applicable: no spec of its own; the port's spec is opencode/docs/specs/opencode-agents-port.md.
---

created: 2026-10-18 04:02
---
Correction to DoD #3, after review on PR #92: 'not applicable' was wrong, because this card changed agent/scout.md's body and frontmatter. the migration-checklist checks that apply under OpenCode's schema were run over the files PR #91 changed (the compound, glossary, handoff, looping and run-article SKILL.md files and agent/scout.md), and the findings table is in PR #92. For scout: the frontmatter decodes on OpenCode 1.18.30 (rulesets.test.ts, 'every body decodes'), the four contract sections are in order, no dashes or hard wraps, no scaffolding lines. One finding, not fixed: check 16's 60-line limit, at 225 lines, 195 of them the frontmatter permission ruleset and its reasons and 30 the body. On OpenCode the ruleset lives in frontmatter, so the register's migration-checklist row now names check 16 among the checks that describe the Claude Code tree.
---
<!-- COMMENTS:END -->
