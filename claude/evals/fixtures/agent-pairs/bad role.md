role: bad role
description.opus: Bad fixture whose role contains a space.
description.fable: Bad fixture whose role contains a space, Fable model.
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

This body's role and filename stem are both "bad role", which contains a
space, outside [a-z0-9-]. A role like this would silently split $ROLES,
the space-joined list the rest of the script iterates by word-splitting.

## Scope

Do nothing real. This fixture exists to prove the generator refuses.

## How you work

1. Exist as a fixture and nothing more.

## Invariants

Never run for real.

## Handoff

Not applicable, this is a fixture body.
