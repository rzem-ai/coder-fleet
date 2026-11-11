---
name: lead-procedures-split
description: From CF-193.5 the lead body is six decisions and the mechanics live in skills/lead-procedures; check moved rules there and in help-boards before calling one dropped
metadata:
  type: project
---

CF-193.5 (reviewed round 1, 2026-11-12) moved the lead's mechanics into `claude/coder-fleet/skills/lead-procedures/SKILL.md`, ten sections pinned by roster-contract.sh, with a 250-word cap per lead step and per skill paragraph. Binding, resume, workflow-run ownership, the `[board:]` completion marker and the missing-task-tools rule went to `help-boards` (not copied), and they are there.

**Why:** single-paragraph steps of 1000+ words; the human sometimes runs the lead on Fable.

**How to apply:** before raising "the lead lost rule X", grep the body, the skill and help-boards. Prose elsewhere that says "the lead's step N says" may now point at the skill (kickoff.md:82, spec-to-card.js:93 comment, register rows were left stale at round 1). The skill's memory paragraph names `memory-state.sh`, which exists only once CF-183.2 lands; the lead decided that ordering on the card, so raise release order as a follow-up, not a must fix. `disable-model-invocation: true` on a preloaded skill is fine (handoff uses it). Round 2 (d6d03eb..30e0f6b, 2026-11-12): the step-5 citations now name "lead-procedures, Handoffs and proposals", and roster-readme-fixture.sh proves the section and paragraph checks through LEAD_SKILL_OVERRIDE; the citations left in review-round.js and kickoff.md (lead.md steps 2, 3 and 4) still land, because those decisions stayed in the body. The skill's prose-only paragraph paraphrases review-round.js's NOT_PROSE_DIR_RE and leaves some entries out; treat that as Low, never a must fix. See [[memory-state-carry-rule]], [[gate-run-quirks]].
