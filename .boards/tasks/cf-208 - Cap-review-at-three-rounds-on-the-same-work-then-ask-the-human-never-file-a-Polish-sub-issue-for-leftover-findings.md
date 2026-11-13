---
id: CF-208
title: >-
  Cap review at three rounds on the same work, then ask the human; never file a
  Polish sub-issue for leftover findings
status: To Do
assignee: []
created_date: '2026-11-13 13:33'
updated_date: '2026-11-13 13:33'
labels: []
dependencies: []
priority: High
type: enhancement
ordinal: 336000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human, 14 Nov 2026, after a Fathom lead wrote: "564.2 has used its one review and one fix round, so the remaining work goes to a Polish sub-issue, FTH-564.2.1." The human's words: "I DO NOT want extra cards like this popping up, better to have another round, which is what this actually is - cap at 3 review rounds before you come back to me and ask rather than just create yet another card to track".

Today, lead.md step 4 allows one review round and at most one fix round, a second round only for an auth diff, and turns anything still open into one Polish sub-issue. lead-procedures (Review and escalation), the review-round workflow and /drain carry the same rule. This card replaces that rule: up to three review rounds, each with its fix, on the same branch and the same card. After the third round, anything still open becomes a question to the human, and no card is filed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No agent body, skill, workflow or command tells the lead to file a Polish sub-issue, or any other card, to hold review findings left open after a round. The lead's definition, lead-procedures, the review-round workflow, /drain, /triage, the glossary and docs/fleet-design.md agree on this
- [ ] #2 A change gets up to three review rounds, each followed by its fix round, on the same branch and card, without asking the human. An authentication or credential diff is under the same cap, with every one of its rounds the deeper review
- [ ] #3 Findings still open after the third round go to the human as one question: AskUserQuestion in the session and an actionsAdd entry on the card. Under /drain, the card is parked on that question instead
- [ ] #4 The review-round workflow's round limit defaults to three. When it stops at the cap with findings open, it returns a stop reason the lead turns into that question, and it commissions no further fix
- [ ] #5 The deterministic suite's checks over these files (evals, workflow logic tests, roster) are updated to match and pass
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
created: 2026-11-13 13:33
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-5.

A coder is building this on branch cf-208-review-cap-three. Done so far: from this session on, I follow the rule myself. Not done: the fleet change. Once it lands and you update the plugin, no lead in any project files a Polish card for leftover review findings. Each one runs up to three review rounds and then asks you.
---
<!-- COMMENTS:END -->
