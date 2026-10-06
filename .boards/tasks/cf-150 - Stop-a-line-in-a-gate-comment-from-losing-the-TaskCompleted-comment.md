---
id: CF-150
title: Stop a '---' line in a gate comment from losing the TaskCompleted comment
status: To Do
assignee: []
created_date: '2026-10-06 13:22'
labels:
  - hooks
dependencies: []
priority: Low
type: bug
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's go, 2026-10-06, from a read of ~/.local/state/coder-fleet/log/hooks.log. Three lines since 2026-10-05T12Z read `[TaskCompleted] board task edit failed (exit 1): Comment body cannot contain standalone '---' delimiter lines.` The gate's comment carries test output, and a standalone `---` line in that output (a YAML separator or a diff header, for example) makes the board reject the whole comment, so the card gets no record of the gate run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every hook that writes a comment from text it did not author rewrites a standalone '---' line so the board accepts it, in one shared place, and the comment is otherwise unchanged
- [ ] #2 A contract case feeds a gate output with a standalone '---' line and shows the comment landing on the card
- [ ] #3 bash claude/evals/lib/check-all.sh passes
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
