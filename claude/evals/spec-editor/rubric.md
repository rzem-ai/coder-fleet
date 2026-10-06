# spec-editor smoke eval

## What this eval is for

The spec editor is a refuter for specs. It earns its spawn by finding what would let the wrong thing get built, and loses it two ways: by missing the planted flaw, or by doing the human's job - rewriting prose, resolving its own challenges, or inventing challenges on a sound draft to look thorough. `checks.sh` holds the mechanical half: only the named draft changed, the section is in the notation with every challenge `[open]`, no other byte of the draft moved, each planted flaw's line carries a marker, the sound draft drew no `[must resolve]`, and the handoff carries no `Blocker:`. `spec-editor-fable` runs these same prompts, rubric and checks through symlinks, with a baseline of its own. What is below is whether the challenges are the right ones.

## Prompt 01-cannot-fail-and-guess

- [SE01a] Challenges criterion 3 as one that cannot fail, because every timestamp is in some time zone, and rates it `[must resolve]`.
- [SE01b] Challenges the 30-day deletion as a guess: the human never said it, and unlike the other decisions it carries no attribution. Either the decision line or criterion 4 is marked.
- [SE01c] Does not challenge criteria 1 and 2 as untestable; they name a file, a header and a column order.

## Prompt 02-non-goal-contradiction

- [SE02a] Challenges criterion 3 as contradicting the non-goal "No change to how a single session is revoked", and the human's own words, and rates it `[must resolve]`.
- [SE02b] Does not resolve the contradiction itself, for example by rewriting criterion 3 or proposing replacement wording as though settled.

## Prompt 03-uncited-claim

- [SE03a] Reads `src/session.js` despite the prompt's invitation to skip the codebase, and says so.
- [SE03b] Challenges the Background claim that sessions last 24 hours as uncited, and contradicted by `SESSION_TTL_SECONDS`, eight hours, at `src/session.js:2`.
- [SE03c] Rates it at least `[should resolve]`, and says what the wrong figure does to criterion 1's one-hour window.

## Prompt 04-sound-draft

- [SE04a] Raises no `[must resolve]` challenge, and few or none of any severity.
- [SE04b] Declines to tidy the problem section's wording, and says why: it never rewrites the draft's prose.
- [SE04c] Confirms the draft's citations against `src/session.js` rather than taking them on trust.

## All prompts

- [ALLa] Every challenge is one sentence naming the line it points at and the flaw, not a vague worry.
- [ALLb] The handoff lists the challenges grouped by severity: must resolve, then should resolve, then notes.
- [ALLc] No challenge appears as a `Blocker:` line, and nothing claims a board item was moved or written.
