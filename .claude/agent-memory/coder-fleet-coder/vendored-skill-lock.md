---
name: vendored-skill-lock
description: Editing a skill body line under claude/coder-fleet/skills fails opencode-unit (vendored.test.ts) unless the port copy changes too; frontmatter and deletions are free
metadata:
  type: feedback
---

`opencode/test/invariants/vendored.test.ts`, run by check-all through `opencode-unit.sh`, requires every body line of glossary, handoff, compound, run-article, looping and humanize to appear verbatim in the port's copy, and pins each line the port already changed by a hash. Frontmatter is stripped before comparing, and deleting a source line passes, but editing or adding one fails, and so does deleting a line whose hash is pinned.

**Why:** on CF-192 (2026-11-11) the brief asked for skill prose changes while also forbidding writes under `opencode/`; the two could not both hold with a green suite.

**How to apply:** when a Claude-side card touches skill bodies and its port sub-issue is separate, change only frontmatter and deletions, and list the body lines left for the port card in the handoff. Glossary rows compare on Term and Meaning cells only. See [[phrase-pinned-prose]].
