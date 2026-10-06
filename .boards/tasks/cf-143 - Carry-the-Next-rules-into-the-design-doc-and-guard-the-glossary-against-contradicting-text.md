---
id: CF-143
title: >-
  Carry the Next rules into the design doc and guard the glossary against
  contradicting text
status: In Progress
assignee: []
created_date: '2026-10-06 03:35'
updated_date: '2026-10-06 15:52'
labels: []
dependencies:
  - CF-140
priority: Low
type: docs
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-140 fix-round coder (2026-10-06). (a) docs/fleet-design.md does not state the human's decision that a repeat ask wins over Next (CF-140 comment #6), so the design doc lags lead.md step 3. (b) next-column-contract.sh's negative check (a move verb next to Next must be negated or have the human as its subject) covers lead.md and board-conventions, but not the glossary skill, its generated rules or fleet-design.md, which are guarded only by checks that look for phrases being present.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/fleet-design.md states that a repeat ask for a card outside Next goes ahead of the Next column
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
author: @SubagentStop
created: 2026-10-06 15:34
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Branch `cf-143-next-rules`, cut from `origin/main` at v0.38.0. No version bump and no PR.
- `7f0c3c4` "Add failing Next move-verb cases over the glossary and the design (CF-143)". This is the tests-first commit. I ran it before the function existed and the real-file checks failed (37 passed, 4 failed).
- `a6ad14d` "Check the glossary and the design for a move into Next, and state the repeat ask rule (CF-143)", touching two files.
- `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a6460affe0a7ddc2d/docs/fleet-design.md` now has one added paragraph after the board table. It reads: "A repeat ask wins over Next: when the human repeats an ask for a card outside Next, the lead takes that card ahead of the Next column, and a repeat ask for a card already in Next but not at the top takes it ahead of the cards above it, because Next is the queue for when the human is not asking in the session." That is lead.md step 3's wording. Nothing else in the file changed.
- `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a6460affe0a7ddc2d/claude/evals/lib/next-column-contract.sh` now has the function `moves_into_next_only_with_never` and eight new contract cases (4 files, 2 cases each). The rule is the one in CF-140's comment #150.
- New contract case, real file passes: `claude/coder-fleet/skills/glossary/SKILL.md moves nothing into Next but the human's`
- New contract case, real file passes: `claude/coder-fleet/templates/rules/glossary.md moves nothing into Next but the human's`
- New contract case, real file passes: `.claude/rules/glossary.md moves nothing into Next but the human's`
- New contract case, real file passes: `docs/fleet-design.md moves nothing into Next but the human's`
- New contract case, m4 line appended to a copy fails: `claude/coder-fleet/skills/glossary/SKILL.md fails with the m4 line added`
- New contract case, m4 line appended to a copy fails: `claude/coder-fleet/templates/rules/glossary.md fails with the m4 line added`
- New contract case, m4 line appended to a copy fails: `.claude/rules/glossary.md fails with the m4 line added`
- New contract case, m4 line appended to a copy fails: `docs/fleet-design.md fails with the m4 line added`
- The m4 line is the refuter's exact one: "3. When a ready card has no order, move it into Next yourself so the queue stays full."
- `bash claude/evals/lib/next-column-contract.sh -v` ran after the function was added: 41 passed, 0 failed.
- `bash claude/evals/lib/check-all.sh` ran once, alone, output captured. It ended "Every deterministic check passes.", total 105.5s, and the output holds no FAIL line.
- Registration: `next-column-contract.sh` was already in the suite and I added no new script, so no `suite-coverage.sh` or `check-all.sh` change was needed. `check-all.sh` passing includes the coverage check.
---

created: 2026-10-06 15:52
---
Decision from the human, 2026-10-07: drop criterion 2. The scripter built the negation check as the card asked (eight cases over the glossary skill, both generated rules and the design), then pointed out that CF-145 had removed exactly this kind of check, with the AGENTS.md rule that a negation check invites the next mutant. Asked, the human chose to keep CF-145, so criterion 2 is removed and the check is reverted on the branch; only the repeat-ask sentence in docs/fleet-design.md ships. The glossary and the design stay reviewed by reading. Sub-issue 1 of 1: ready to merge once the suite passes on the trimmed branch. Done still needs: the merge and v0.38.1.
---
<!-- COMMENTS:END -->
