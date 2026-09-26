---
name: handoff
description: The handoff format every fleet subagent ends its final message with - the four fixed headings Done, Not done, Unverified and Decisions needed, and the typed Blocker / Propose item / Propose memory lines the lead reads out of it and actions. Nothing validates it, so the format is the whole contract. Preloaded into every agent's context by the fleet plugin.
---

# Handoff format

End every final message with a handoff. It is a machine contract, not a style guide, and here nothing enforces it. OpenCode has no subagent lifecycle events, so no hook reads your last message, nothing rejects a malformed handoff, and nothing sends you back to write it again. The only consumer is the lead that spawned you, reading `## Decisions needed` for the lines it has to action and merging the rest into its account of the session.

That makes the format more load-bearing here, not less. Deviate and you are not corrected, you are misread. Get it subtly wrong and either a blocker is missed, so the human never learns they are needed, or a routine suggestion parks a false alarm in their queue - and in both cases the run looks like it succeeded. A handoff does not degrade gracefully: a missing heading or a dropped typed line is indistinguishable from an agent with nothing to report. Write it to the anchors below as though a parser were reading it, because the format is the contract whether or not anything is currently checking it.

## Structure

Four sections. Always these four, always this order, always all four present:

```
## Done
## Not done
## Unverified
## Decisions needed
```

Rules a `grep`/`sed` parser depends on:

- Heading lines are exactly `## ` plus the wording above. Level 2, one space, that capitalisation, no trailing punctuation, no numbering, no bold. Anchor: `^## (Done|Not done|Unverified|Decisions needed)$`, applied after every line is right-trimmed - trailing whitespace is invisible and never changes what a line means, but leading whitespace still does.
- Use no other level-2 heading anywhere in the final message.
- Every item is one markdown list item starting `- ` at column 0. No nesting, no sub-bullets, no code fences, no tables.
- No blank line inside a section. The only blank line the parser allows is the one before the next heading, as in the example below.
- One item is one line. Items never wrap - the newline ends the item. Keep each under roughly 200 characters; split a long one into two items.
- An empty section contains exactly one line: `- None`. Never omit a section and never leave one blank, so a parser never has to distinguish "no blockers" from "the agent forgot the section".
- The handoff is the last thing in the message. Nothing follows the last item of Decisions needed.

## What goes where

- **Done** - what you changed or established, with paths. Verified work only.
- **Not done** - in-scope work you did not finish, including anything stopped by a failure or a cancellation.
- **Unverified** - claims you could not prove: untested code, commands you did not run, assumptions you carried forward.
- **Decisions needed** - typed lines only, per below.

## Typed lines

Every line under Decisions needed carries one of exactly three prefixes. Case-sensitive, spelled exactly as written, colon then a single space:

- `- Blocker: ` - the work is stopped until the human answers. This and only this moves the board item into "blocked by human". Use it only when you genuinely cannot proceed; it costs them an interruption.
- `- Propose item: ` - suggested new board work. The lead files it. It never touches the human queue.
- `- Propose memory: ` - worth filing into the shared memory corpus. Only `researcher` and the lead can write there, so one of them actions it.

Anchor: `^- (Blocker|Propose item|Propose memory): `.

There is no fourth prefix and an untyped line is invalid.

A typed line belongs under `## Decisions needed` and nowhere else. Start a line with one of those three prefixes under `## Done`, `## Not done` or `## Unverified` and the whole handoff is malformed. It is not read from there and it is not quietly moved for you. Nothing here will notice and correct it, which is the point: the lead looks under `## Decisions needed` and nowhere else, so a blocker filed in the wrong section is a blocker nobody ever sees.

The anchors match the start of a line, so naming a prefix mid-sentence in prose costs nothing. What matters is where a line that *starts* with one appears.

## Do not signal status in the text

Nothing carries a status for you - not `success`, not `failure`, not `cancelled`. There is no lifecycle event at the end of a subagent run here to carry one, and the lead receives your final message and nothing else. So this handoff is the only account of the run that anything downstream gets. That does not mean inventing a status line, a "FAILED" banner or a truncated message: the four sections already say it. What went wrong goes under Not done, what you could not prove goes under Unverified, and anything that needs the human before the work can continue is a `Blocker:` line - which is the one route to the human queue that actually works.

## Example

```
## Done
- Added POST /sessions/refresh in src/api/auth.ts with rotation on reuse.
- Rotation unit tests pass: pnpm test src/api/auth.test.ts.

## Not done
- Rate limiting on the endpoint. Phase 3 of the plan, not started.

## Unverified
- Never exercised against staging Redis, only the in-memory fake.
- Assumed refresh tokens are single-use; the spec does not say.

## Decisions needed
- Blocker: Refresh token TTL is unspecified and phase 3 depends on it. 7 days or 30?
- Propose item: Migrate the legacy /token endpoint onto the same rotation logic.
- Propose memory: We chose rotation-on-reuse over sliding expiry for the project's services.
```
