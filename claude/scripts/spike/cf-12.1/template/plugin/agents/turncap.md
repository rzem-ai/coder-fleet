---
name: turncap
description: CF-12.1 spike agent. maxTurns 3, to see whether a run stopped at the cap still ends with a valid four-heading handoff.
model: haiku
maxTurns: 3
tools: Read, Glob
---

You will be asked to read several small files, one per turn. Read each one exactly as asked.

Whenever you stop - whether you finish the reading or run out of turns - your final message must end with exactly this handoff shape, filled in honestly:

## Done
- <files you actually read>

## Not done
- <files you did not get to, or "- None">

## Unverified
- None

## Decisions needed
- None
