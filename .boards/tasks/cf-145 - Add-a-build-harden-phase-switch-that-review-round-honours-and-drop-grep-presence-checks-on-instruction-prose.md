---
id: CF-145
title: >-
  Add a build/harden phase switch that review-round honours, and drop
  grep-presence checks on instruction prose
status: Blocked by human
assignee: []
created_date: '2026-10-06 04:24'
updated_date: '2026-10-06 09:39'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/lib/fleet-config.py
  - claude/coder-fleet/workflows/review-round.js
  - claude/evals/lib/next-column-contract.sh
  - claude/evals/lib/lead-rules-contract.sh
  - CF-111
priority: High
type: feature
ordinal: 181000
---

## Actions for Human
<!-- ACTIONS:BEGIN -->
- [x] #1 Criterion 5 asks for a green check-all, and my one full run exited 1. Its two failing sections (board-hook-contract `live-card-gate-blocks`, board `cli-check-uncheck` timeout) passed when rerun alone on the same commit, and neither reads a file this branch changed. Do you accept those reruns as the green suite, or should a full check-all be rerun on `ea18436` before this closes?
<!-- ACTIONS:END -->

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 after the lead's session review (see CF-144 for the words). Adopted: a build/harden phase switch, and dropping grep-presence checks on prose.

Why: the pipeline has no way to say 'not yet' to a finding, so every finding becomes a fix round now. On CF-140 a refuter attacked instruction prose, its survivors forced a fix round that added phrase and negation greps, and the next refuter found six more survivors in those greps. Phrase-presence checks pass when contradicting text is added elsewhere, so they give false confidence and invite the loop.

The switch lives beside disabledAgents in .claude/coder-fleet.json, read live from the main checkout by the same two readers (hooks/lib/fleet-config.py and the JS reader in review-round), with their parity fixtures extended.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .claude/coder-fleet.json accepts phase: "build" or "harden"; absent means build; both readers agree on every fixture, including an invalid value, which is reported and treated as build
- [ ] #2 review-round in build phase runs one round, commissions no fix round for lows, spawns the refuter only when the diff touches authentication or credential paths, and reports proposals without filing them; in harden phase it behaves as today; both proven in workflow-logic tests
- [ ] #3 /coder-fleet:agents (or a sibling command) shows the phase and sets it with `phase build` or `phase harden`
- [ ] #4 Contract checks over agent bodies and skills are limited to structure: frontmatter fields, section order and count, step count, line limit, no dashes, no hard wraps; the phrase-presence and negation checks over lead.md and board-conventions in next-column-contract.sh and lead-rules-contract.sh are removed, and AGENTS.md says instruction prose is reviewed by reading
- [ ] #5 check-all is green and the version is bumped
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
created: 2026-10-06 09:04
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-5. Version 0.37.0 assumed on top of v0.36.2.

Done: nothing yet; review-round still runs the full ladder on every change and the prose greps are still in the suite.
Not done: the phase switch, its command, the workflow honouring it, and the grep removal.
---

author: lead
created: 2026-10-06 09:39
---
Action #1 answered by the lead, 2026-10-06 (a decision the lead's default covers, not one for the human): the coder's single full check-all exited 1 on board-hook-contract `live-card-gate-blocks` and the board's `cli-check-uncheck` (a 10 s timeout at 13.8 s) while CF-70's review round was running its own suite on the same machine; both passed alone on the same commit and neither reads a file the branch changed. That is not accepted as the green suite on its own. The independent full run is the review round's refuter baseline, which runs check-all on this commit in a scratch copy; CI's deterministic run covers everything but the board sections (no bun on the runner). If either fails on these sections again, it is a failure and not an intermittent one.
---

author: lead
created: 2026-10-06 09:39
---
Sub-issue 1 of 1: ready to merge in PR #68 (cf-145-phase-switch, v0.37.0), after review. Done still needs: one design change before the review (below), one review round with a refuter (workflow and hook-lib code), criteria 1-5 ticked on main, the version settled against CF-70's 0.37.1 whichever merges second, the tag, the close.

Done, on the coder's word: `phase` in .claude/coder-fleet.json read by both readers with 56 parity fixtures (absent, invalid, BOM, streams, duplicate keys, trailing garbage, depth edges); in build, review-round runs one round, hands blocking findings back with no fix lane, drops lows, refutes only on SENSITIVE paths, files no proposals; every pre-existing case pinned to harden passes unchanged; `/coder-fleet:agents phase [build|harden]` shows and sets it, writing the main checkout's file from any worktree; the self-exemption the security review flagged is closed: a range that changes the config file refutes as harden would, and a phase read from a worktree is not believed (916a0ad, four cases red first); lead-rules-contract.sh deleted, next-column trimmed to structure and commands, AGENTS.md says instruction prose is reviewed by reading. workflow-logic 587/0.
Not done: nothing on main. Lead's default on an unverified point, sent to the coder: an unread or unresolved config must fall to harden, not build, because build is the lenient phase and a failed read is no evidence of the human's choice; only an absent file means build. Held proposals: structure-only rule for the other contracts that read agent bodies; `--check` warning on an invalid phase; a phase line in lead.md; carrying the refuter's Propose lines into review-round's proposals.
---
<!-- COMMENTS:END -->
