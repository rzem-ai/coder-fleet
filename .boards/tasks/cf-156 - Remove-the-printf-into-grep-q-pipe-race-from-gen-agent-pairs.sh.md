---
id: CF-156
title: Remove the printf-into-grep -q pipe race from gen-agent-pairs.sh
status: To Do
assignee: []
created_date: '2026-10-07 00:48'
labels:
  - evals
dependencies: []
priority: Medium
type: bug
ordinal: 286000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lead on 2026-10-07, on PR #80's CI: `claude/scripts/gen-agent-pairs.sh: line 325: printf: write error: Broken pipe` failed the agent-pairs section, and the rerun of the same commit (16e443d) passed, so it is an intermittent failure shown by two runs. Lines 325, 329 and 333 pipe `printf '%s\n' "$template"` into `grep -qx`; grep -q exits on the first match, printf can then hit SIGPIPE, and under pipefail the pipeline fails. It is the race v0.37.4 removed from about 80 sites in the eval helpers, where `x | grep -q` became a here-string. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No `printf ... | grep -q` (or other early-exiting reader) pipeline remains in claude/scripts/gen-agent-pairs.sh; each is a here-string or an equivalent that cannot SIGPIPE
- [ ] #2 A search over claude/scripts and claude/coder-fleet/scripts finds no other such pipeline, or each one found is fixed the same way
- [ ] #3 bash claude/evals/lib/check-all.sh passes on the branch
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
