---
name: lead-word-caps
description: roster-contract caps each lead.md step and each lead-procedures paragraph at 250 words and pins the skill's H2 list (eleven since CF-3); a new lead rule goes in the skill
metadata:
  type: project
---

Since CF-193.5 (2026-11-12) lead.md steps state decisions only; mechanics live in `claude/coder-fleet/skills/lead-procedures/SKILL.md`. `roster-contract.sh` fails a lead step over 250 words, a skill paragraph over 250 words, or a renamed/missing skill H2 (the list is `WANT_LEAD_SECTIONS`). CF-3 (2026-11-15) added `## Goals` last, making eleven, and the check's label says "eleven sections".

**Why:** the 60-line cap plus no-hard-wrap made every new rule lengthen a step until steps hit 1300 words.

**How to apply:** put a new lead rule in the skill section it belongs to; step 4 sits near 247 words and, since CF-2.2 (2026-11-15), step 5 near 244, so even a clause in either needs a trim. Adding or renaming a skill section means editing `WANT_LEAD_SECTIONS`, the check's count label and the body's "under <Section>" pointers together. No port vendors lead-procedures, so a body edit there trips no opencode-unit lock. Count with a scratch script, not by eye.
