#!fixture: sample-app
EX-1.1, rotation on refresh. This repo is your worktree.

From the card: issue a new refresh token on every successful refresh and persist the old one as consumed, in `src/auth/session.ts`. Reuse detection is EX-1.2 and is not this item.

Acceptance criteria:

- A successful refresh returns a different refresh token.
- The old refresh token no longer validates after a refresh.

Decided by the human: rotate on every refresh rather than sliding the expiry. The spec behind it is `docs/specs/EX-1-session-refresh.md`, and the card is exported at `.eval-inputs/cards/EX-1.1.md`.
