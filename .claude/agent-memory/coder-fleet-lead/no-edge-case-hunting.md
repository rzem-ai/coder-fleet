---
name: no-edge-case-hunting
description: don't hunt edge cases in coding, testing or review; build and judge against the card's criteria and let edge cases surface naturally
metadata:
  type: feedback
---

Don't go hunting for edge cases when coding, testing or reviewing. They will appear naturally. Briefs ask for the card's criteria and nothing more, and reviews judge against those criteria and plain correctness.

**Why:** on 14 Nov 2026 the human set this as a goal after CF-209.2 and CF-209.3 spent several rounds chasing ever more exotic shell spellings (security-check findings and break-mode attacks) that weren't converging, while the main body of work waited.

**How to apply:** use review mode, not break mode, unless the card is an auth or credential path the human named. Don't forward the automated security check's findings into fix rounds unless one breaks a stated criterion in an ordinary use. Keep fix rounds to must-fix findings, and drop every Low. Related: [[no-gold-plating-fixes]], [[review-rounds-cap-three]].
