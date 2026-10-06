---
id: CF-2
title: Sweep the port docs for present-tense old names
status: Next
assignee: []
created_date: '2026-09-26 12:21'
updated_date: '2026-10-06 14:06'
labels: []
dependencies: []
priority: Low
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
opencode/docs and codex/docs still say claudecode-agents and Alex in lines describing the present rather than history, for example codex/docs/specs/GPTA-1.md lines 61 and 238 and divergence-register rows 19 and 69; lines that record history stay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No line under opencode/docs or codex/docs that describes the present state of the port says `claudecode-agents` or names the human; the examples in the description (codex/docs/specs/GPTA-1.md lines 61 and 238, divergence-register rows 19 and 69) are among the fixed lines
- [ ] #2 Every line that records history, a past decision or a dated event keeps its text, and the handoff lists each line left alone for that reason with the file and line
- [ ] #3 Nothing outside opencode/docs and codex/docs changes
- [ ] #4 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-06 14:06
---
Ordered: the human placed this card in Next (ordinal 2000, second from the top) on 2026-10-06. It is a prose sweep, so no spec: the provisional criterion is replaced by four written from the card's own words, which are the human's. Decisions the builder needs: 'present tense' means a line describing how the port is or works now; a line recording what was done, decided or named at a date stays. Replacement wording is 'coder-fleet' for the old project name and 'the human' for the name, as AGENTS.md says. Taken now in parallel with CF-12.3 because the two touch no common file. CF-143 (top of Next) waits until CF-12.3 merges, since both edit docs/fleet-design.md and the Next contract; the lead should have taken CF-143 and CF-2 before CF-12.3 and did not.
---
<!-- COMMENTS:END -->
