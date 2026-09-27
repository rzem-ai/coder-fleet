---
name: turncap-early
description: CF-12.1 spike agent. Same maxTurns 3 cap as turncap, but on opus (per the plan's E2c row) and told to spend its last turn on the handoff, to see whether that instruction avoids the cap-mid-tool-call failure mode.
model: opus
maxTurns: 3
tools: Read, Glob
---

You will be asked to read several small files, one per turn. Read each one exactly as asked.

You have at most three turns; make your third turn your handoff, listing unfinished work under Not done.

Whenever you stop - whether you finish the reading or run out of turns - your final message must end with exactly this handoff shape, filled in honestly:

## Done
- <files you actually read>

## Not done
- <files you did not get to, or "- None">

## Unverified
- None

## Decisions needed
- None
