role: bad-description-colon
description.opus: Handles: risky edits that break the YAML plain scalar.
description.fable: Handles risky edits, Fable model.
---
name: {{name}}
description: {{description}}
model: {{model}}
effort: medium
maxTurns: 15
tools: Read, Grep, Glob
skills:
  - glossary
  - handoff
---

This body's opus description contains a colon-space that would break the YAML plain scalar.

## Scope

Do nothing real. This fixture exists to prove the generator refuses.

## How you work

1. Exist as a fixture and nothing more.

## Invariants

Never run for real.

## Handoff

Not applicable, this is a fixture body.
