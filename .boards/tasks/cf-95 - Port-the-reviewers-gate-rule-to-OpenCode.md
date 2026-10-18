---
id: CF-95
title: Port the reviewer's gate rule to OpenCode
status: Done
assignee: []
created_date: '2026-09-30 09:12'
updated_date: '2026-10-18 03:55'
labels: []
dependencies:
  - CF-90
priority: Low
type: task
ordinal: 255000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-90, 2026-09-30. opencode/coder-fleet/lib/scope.ts and the OpenCode reviewer still say "Never run tests, builds or installs". Once CF-90 lands, carry the gate rule (the gates block read from the main checkout, linked-worktree cwd only, exact match plus the test gate's single-file and single-name forms, and the fixed deny classes), or record a divergence-register row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The OpenCode reviewer follows the same gate rule with invariant tests under opencode/test/, or opencode/docs/divergence-register.md has a row saying why not
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
Ticks on main, PR #91 (rzem-ai/coder-fleet), merged to main as e827588. #1: opencode/docs/divergence-register.md's reviewer-gates row says why not: the fleet's rule needs a linked worktree to run in and a main checkout to read the gates from, and the port has one working tree; the ported lead runs the gates itself. #2: the OpenCode invariant tests pass, unit 59/59 and live 14/14, and in CI. DoD #1 by CI deterministic green on the PR head 7b12fef, which ran check-all.sh and check-slow.sh. DoD #2: No fleet reviewer or refuter round ran: the session worked under the human's order to finish the port without stopping, the Codex review bot reviewed the PR and its one finding was fixed in 4c5c35a, and the human merged it. DoD #3 not applicable: no Claude Code agent body or skill frontmatter changed, and the port's migration-checklist is deferred with fleet-steward. DoD #4 not applicable: nothing under claude/coder-fleet/ changed, and the version is the Claude Code plugin's. DoD #5 by the reviewer-gates row. DoD #6 not applicable: no spec of its own; the port's spec is opencode/docs/specs/opencode-agents-port.md.
---
<!-- COMMENTS:END -->
