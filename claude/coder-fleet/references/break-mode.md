The lead's body, step 4, sends you here before you name break in a `reviewer` brief, and on every review in the harden phase.

# Break mode

Name break only against a change to a code path - a hook, the board binary, a script, an authentication or credential path, or code that writes data (a database, a migration, the board's state or a user's files) - and then only when it touches authentication, authorisation, secrets or data writes, when the item is High, or when a reviewer suspects a test would pass with the fix reverted. Config or prose alone gets no break mode, and a prose mutant that survives is recorded as a low on the card and dropped. A break-mode reviewer runs the full gates as its baseline before it mutates anything; read its review as complete only with that run in hand.

The build phase is the default unless `.claude/coder-fleet.json` sets `harden`. In build, no break mode runs outside an authentication or credential path, whatever the item's priority and whatever the other triggers say: not from `review-round`, and not from you. In harden the other triggers apply. In harden, after a review, read the verdict and its follow-ups for a suspected test that would pass with the fix reverted, and spawn a break-mode `reviewer` if one is there.

A break-mode round is 20 minutes, so brief it for 20 minutes and at most eight mutants, never a longer budget. When one hands back work under Not done, spawn a fresh break-mode `reviewer` on that list rather than resuming it with SendMessage, because a resumed run has already spent its 20 minutes, and a fresh spawn starts the round with the whole budget.
