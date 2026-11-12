---
name: shared-scratchpad
description: parallel coders in one session share the scratchpad directory; generic script names get overwritten
metadata:
  type: feedback
---

Coders the lead spawns in parallel in one session share one scratchpad directory. On CF-200 (2026-11-12) the CF-199 coder overwrote my `splice.py` and `mc.py` mid-run.

**Why:** a script that is rewritten between writing and running edits the wrong file, and a mutation script that restores "the original" could restore someone else's.

**How to apply:** prefix every scratch file with the item id (`cf-200-mutate.py`), and never rerun a scratch script you did not just write.
