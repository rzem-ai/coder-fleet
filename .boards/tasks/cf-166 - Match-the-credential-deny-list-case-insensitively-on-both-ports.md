---
id: CF-166
title: Match the credential deny list case-insensitively on both ports
status: To Do
assignee: []
created_date: '2026-10-18 12:39'
labels:
  - security
dependencies:
  - CF-164.1
priority: High
type: bug
ordinal: 304000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-18, via AskUserQuestion: "File it and start now", after CF-164.1's second review found the OpenCode credential patterns (opencode/coder-fleet/lib/scope.ts CREDENTIAL_PATTERNS) match case-sensitively. On case-insensitive APFS, the macOS default, `~/.SSH/authorized_keys`, `~/.SSH/id_rsa` or `.NPMRC` reach the real file through patch, write, read and shell. Predates CF-164.1. The Claude Code side (claude/home/settings.json deny list and enforce-agent-scope.sh credential checks) may have the same gap. Builds after CF-164.1 merges, since it touches the same scope.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A failing-first unit case shows the OpenCode credential lock allows a case-variant credential path (`~/.SSH/id_rsa`, `.NPMRC`) through read, patch and shell, and passes once fixed
- [ ] #2 Every credential pattern in opencode/coder-fleet/lib/scope.ts matches regardless of case, and no existing deny is narrowed
- [ ] #3 The Claude Code side is checked for the same gap - the enforce-agent-scope.sh credential checks and the claude/home/settings.json deny list - and either fixed with a failing-first contract test or the card records the evidence that it is not affected
- [ ] #4 Where a harness's own deny-list syntax cannot match case-insensitively, the gap is a row in docs/limits.md or the port's divergence register with its reason
- [ ] #5 bash claude/evals/lib/check-all.sh passes, and opencode/test/run.sh live passes on 2.0.32
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
