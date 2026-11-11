---
name: mode-header-test-trap
description: To kill a reviewer Modes:-parser mutant through the clock, use a review-only header; a break header caps whether parsed or malformed
metadata:
  type: feedback
---

A malformed `Modes:` header fails closed (capped as break), so a clock test built on a break header passes whether the parser reads it or rejects it. Only a header that reads as review (uncapped, allow) flips to deny when malformed, so that is the one that kills an anchor or window mutant. For break-versus-use precedence the clock is blind too; the scope hook is where they differ (break allows `npm install`, use refuses it).

**Why:** on CF-192 (2026-11-12) the refuter's surviving mutants were all of this shape: the indented near-miss case could not tell the column-0 anchor from no anchor.

**How to apply:** when pinning a reviewer-modes.sh rule, pick the input whose two outcomes differ at the hook you test through; run the mutant through claude/evals/lib/scope-hook-contract.sh (about 110 s) with a backup-apply-run-restore script, per [[workflow-and-mutation-traps]].
