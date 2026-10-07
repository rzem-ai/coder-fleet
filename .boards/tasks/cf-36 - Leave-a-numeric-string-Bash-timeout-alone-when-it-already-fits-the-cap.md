---
id: CF-36
title: Leave a numeric-string Bash timeout alone when it already fits the cap
status: To Do
assignee: []
created_date: '2026-09-27 05:13'
updated_date: '2026-09-30 14:02'
labels: []
dependencies:
  - CF-23
references:
  - claude/coder-fleet/hooks/agent-clock.sh
  - claude/evals/lib/scope-hook-contract.sh
priority: Low
type: bug
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-23 fix round 2 (2026-09-27). agent-clock.sh treats a string `timeout` (e.g. `"timeout":"30000"`) as no timeout given, so at age 1440 s it rewrites the call to about 60000 ms: under the cap, but longer than what was asked. Either parse numeric strings in the hook's jq (`tonumber?`) or leave a call untouched when its string timeout already fits. Whether Claude Code ever sends a string timeout to a PreToolUse hook is unverified.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A refuter Bash call with a numeric-string timeout shorter than the time left is not lengthened, proven by a contract case that fails first
- [ ] #2 A string timeout longer than the time left is still trimmed
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
