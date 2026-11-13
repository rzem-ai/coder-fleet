---
name: no-gold-plating-fixes
description: Don't spend review rounds defending criteria the human never asked for, or fixes that add an external dependency; ask or drop instead
metadata:
  type: feedback
---

Before routing a review follow-up into a fix round, check two things. Is the criterion it defends the human's, or a [supplied] line some agent wrote? Does the fix add a dependency on an external tool or process? Either one means ask the human or drop the finding, never build. Also drop any build-phase finding that no user can reach yet, such as code not yet wired into hooks.

**Why:** on 2026-11-14 CF-207.2 spent review rounds 2 and 3, and two coder passes, on ssh alias resolution (`ssh -G`). It defended a [supplied] spec line ("SSH and HTTPS spellings reach the same board") against a case no user could reach. Every later finding came from the ssh call's own failure modes. The human asked: "Why are you doing ssh alias lookups for local files" and "Why was there so much time spent on it".

**How to apply:** the three-round review cap is a ceiling, not a budget. Prefer the fix that removes code over the one that adds a moving part. See [[review-rounds-cap-three]].
