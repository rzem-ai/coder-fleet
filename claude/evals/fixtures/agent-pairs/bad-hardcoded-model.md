role: bad-hardcoded-model
description.opus: Bad fixture carrying a hard-coded model instead of the placeholder.
description.fable: Bad fixture carrying a hard-coded model instead of the placeholder, Fable model.
---
name: {{name}}
description: {{description}}
model: opus
effort: medium
maxTurns: 15
tools: Read, Grep, Glob
skills:
  - glossary
  - handoff
---

This body hard-codes model: opus instead of using {{model}}.

## Scope

Do nothing real. This fixture exists to prove the generator refuses.

## How you work

1. Exist as a fixture and nothing more.

## Invariants

Never run for real.

## Handoff

Not applicable, this is a fixture body.
