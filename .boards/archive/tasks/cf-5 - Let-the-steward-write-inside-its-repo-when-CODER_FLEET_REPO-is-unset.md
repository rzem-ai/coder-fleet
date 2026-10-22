---
id: CF-5
title: Let the steward write inside its repo when CODER_FLEET_REPO is unset
status: To Do
assignee: []
created_date: '2026-09-26 13:06'
updated_date: '2026-09-30 14:02'
labels: []
dependencies: []
priority: Low
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With CODER_FLEET_REPO unset, claude/coder-fleet/hooks/lib/check-write-scope.py denies every Write and Edit for fleet-steward, including inside the repo, because the repo root that enforce-agent-scope.sh probes in steward_repo_root is never passed to it. Pass the probed root through to check-write-scope.py, with a contract case in claude/evals/lib/scope-hook-contract.sh that fails first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With CODER_FLEET_REPO unset, a fleet-steward Write inside the probed repo root is allowed and one outside it is denied
- [ ] #2 A scope-hook contract case covers it and was seen failing before the fix
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
