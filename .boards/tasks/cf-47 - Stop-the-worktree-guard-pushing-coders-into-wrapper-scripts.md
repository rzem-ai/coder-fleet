---
id: CF-47
title: Stop the worktree guard pushing coders into wrapper scripts
status: To Do
assignee: []
created_date: '2026-09-27 07:35'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/enforce-agent-scope.sh
  - claude/evals/lib/scope-hook-contract.sh
  - docs/limits.md
priority: Medium
type: bug
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-41 coder's handoff, 2026-09-27. Two findings about claude/coder-fleet/hooks/enforce-agent-scope.sh's worktree guard:

1. It over-refuses. It refused `git -C <main checkout> worktree list`, which is read-only, and refused commands that name bash, including running the approved contract test and check-all by absolute path.
2. The coder then ran every contract, check-all and dry run through wrapper scripts it wrote in the scratchpad (chmod +x, run by path with no arguments). The guard never saw what those wrappers executed, so the refusal did not constrain anything; it only hid the command. The coder proposed this as a memory for other agents; the lead did not record it, because it teaches agents to sidestep a safety hook.

Needs: the guard allows read-only `git worktree list` and running an existing script under the worktree or the plugin by absolute path; and either the guard inspects what an executable written in the scratchpad runs, or the gap is recorded in docs/limits.md with its reason. A contract case for each, failing first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
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

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 08:15
---
More evidence from CF-41 fix round 2 (2026-09-27): the guard refused `/bin/bash --version` ("runs bash in a plain command; ... cannot be shown not to run git") while allowing `/bin/bash <contract>` and `bash <check-all>`. In fix rounds 1 and 2 the same coder ran every check directly with no wrapper once briefed not to, so the over-refusal is narrower than round 0 suggested, but it is still inconsistent. Refuters were also refused `git init` in their own scratch copies (CF-26/27, CF-41), which blocks building fixture repos for probes.
---
<!-- COMMENTS:END -->
