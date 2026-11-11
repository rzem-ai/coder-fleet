---
name: lead-word-caps
description: roster-contract caps each lead.md step and each lead-procedures paragraph at 250 words and pins the skill's ten H2s; a new lead rule goes in the skill
metadata:
  type: project
---

Since CF-193.5 (2026-11-12) lead.md steps state decisions only; mechanics live in `claude/coder-fleet/skills/lead-procedures/SKILL.md`. `roster-contract.sh` fails a lead step over 250 words, a skill paragraph over 250 words, or a renamed/missing skill H2 (the list is `WANT_LEAD_SECTIONS`).

**Why:** the 60-line cap plus no-hard-wrap made every new rule lengthen a step until steps hit 1300 words.

**How to apply:** put a new lead rule in the skill section it belongs to; step 4 sits near 247 words, so even a clause there needs a trim. Renaming a skill section means editing `WANT_LEAD_SECTIONS` and the body's "under <Section>" pointers together. Count with a scratch script, not by eye.
