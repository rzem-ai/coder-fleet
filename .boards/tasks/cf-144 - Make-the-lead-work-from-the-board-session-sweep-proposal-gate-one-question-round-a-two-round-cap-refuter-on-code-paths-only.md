---
id: CF-144
title: >-
  Make the lead work from the board: session sweep, proposal gate, one question
  round, a two-round cap, refuter on code paths only
status: In Progress
assignee: []
created_date: '2026-10-06 04:24'
updated_date: '2026-10-06 07:05'
labels: []
dependencies:
  - CF-140
references:
  - claude/coder-fleet/agents/lead.md
  - docs/fleet-design.md
  - CF-52
  - CF-90
priority: High
type: enhancement
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 after the lead's session review. The human's words: "please review this session in how you have gone about picking up work to do, outside of what I have explicitly asked of you ... and make suggestions on how to keep you and the agents on track. this also means leaving working on edge cases and polishing code until the end, and not when the bulk of development should be the focus." The human then adopted, by AskUserQuestion: session-start board sweep; proposals need the human's go to be filed; one question round per item; cap at one review plus one fix round; refute code paths only.

Evidence from the session: CF-139 (High, security, ordered the day before) was dropped because the lead worked from its handover note and not the board; CF-142 was filed as a duplicate of CF-92 because step 5 files every Propose item without a search; a refuter ran on CF-140 (a column added to config.yml plus prose) because 'board or state files' counts config, and its five prose survivors forced a fix round that built a sentence parser; six follow-up questions went to the human on one item.

All edits are to claude/coder-fleet/agents/lead.md (and docs/fleet-design.md where it states the same rule). CF-52 criterion 4 and CF-90 criterion 5 ride in this change because they are the other open lead.md clauses. The lead.md track is serial: this starts after PR #60 (CF-140) is merged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md step 1 says the first action of a session is a board sweep: list Next, In Progress and every card carrying the human's order with work undelivered, and work from that list before any recall or handover note
- [ ] #2 lead.md step 5: a Propose item line gets a board search first; a match becomes a comment on the matched card; no match becomes one line under Decisions needed in the lead's handoff, and a card is filed only when the human says so
- [ ] #3 lead.md step 3: an item's design questions are asked once, in one AskUserQuestion before the first spawn; a reviewer's or refuter's follow-up gets the lead's default recorded on the card instead of a question, unless the default is hard to reverse
- [ ] #4 lead.md step 4: during build an item gets at most one review round and one fix round; whatever is still open after that becomes one Polish sub-issue filed at the end, never a further round
- [ ] #5 lead.md step 4: the refuter triggers name code paths - hooks, the board binary, scripts, authentication and credential paths; a change to config or prose alone gets no refuter; a surviving prose mutant is recorded as a low on the card and dropped
- [ ] #6 lead.md step 3's repeat-ask rule says a repeat ask wins over Next also when the card is already in Next but not at the top
- [ ] #7 CF-52 criterion 4: lead.md says in one clause that agent worktrees cut from the lead's current HEAD
- [ ] #8 CF-90 criterion 5: lead.md step 4 and docs/fleet-design.md say the reviewer runs the declared gates read-only
- [ ] #9 lead.md keeps six steps, roster-contract and lead-rules-contract pass or are updated to the new text, the migration checklist is run over lead.md, check-all is green and the version is bumped
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

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 07:05
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-9, plus the riders from CF-141 (criteria 1-2), CF-52 (criteria 3-4) and CF-90 (criterion 5), all in this one lead.md change. Version 0.36.0 assumed; CF-146 (0.35.3) and CF-56 (0.35.4) run in parallel on other files.

Done: nothing yet; the lead still starts a session from its handover note and files every proposal.
Not done: all nine rules.
---
<!-- COMMENTS:END -->
