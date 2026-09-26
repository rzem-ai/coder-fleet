---
id: CF-5
title: Let the steward write inside its repo when CODER_FLEET_REPO is unset
status: To Do
assignee: []
created_date: '2026-09-26 13:06'
labels: []
dependencies: []
priority: Low
ordinal: 27000
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
