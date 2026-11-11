---
name: opencode-port-traps
description: OpenCode port work - live tests never run on this machine, vendored.test misses extra copy lines, and the port's rulesets cannot vary by brief
metadata:
  type: project
---

Three things that shaped CF-192.1 (2026-11-12) and will shape the next port card.

- `opencode/test/run.sh live` refuses here: the machine has OpenCode 2.1.3 at ~/.opencode/bin, the tests pin 2.0.32. rulesets.test.ts and live.test.ts edits are compile-checked only (`bun build --target=bun <file> --outdir <scratch>`); say so under Unverified.
- `vendored.test.ts` checks that every source line is in the port copy, never the reverse. A line the source deleted (the glossary's Contract row) stays in the copy with the test green. Diff the copy against the source by hand.
- The plugin's tool hook sees only the agent name and the call's args, never the spawn brief, so no ruleset can depend on a `Modes:` line. Anything the fleet gates by reviewer mode is all-or-nothing here, which is a security decision for the lead, not the coder.

**Why:** each one cost a round of reading to find. **How to apply:** check all three before scoping any port item that touches an agent's permissions or a vendored skill. See [[phrase-pinned-prose]] and [[vendored-skill-lock]].
