---
id: CF-120
title: Decide whether disabling an agent also disables its -fable pair
status: To Do
assignee: []
created_date: '2026-10-04 10:57'
labels: []
dependencies:
  - CF-111
priority: Low
type: enhancement
ordinal: 268000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 round 3 reviewer, 2026-10-04. Once `-fable` agent files exist (e.g. `scripter-fable.md`), `disabledAgents: ["scripter"]` will not deny `coder-fleet:scripter-fable`, because `fleet_agent_disabled` matches names as written. And `--check` folds `-fable` on the roster side, so it would call a `scripter-fable` entry one that 'disables nothing' while the hook denies that spawn. Settle the rule and make the hook and the `--check` roster agree before any pair ships. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One documented rule for `X` versus `X-fable` in `disabledAgents`, applied identically by the spawn hook, `--check`, `/coder-fleet:agents` and review-round, with contract cases using a real `-fable` agent file fixture
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
