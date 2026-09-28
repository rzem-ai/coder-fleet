#!fixture: sample-app
EX-1.2, reuse detection. The card is exported at `.eval-inputs/cards/EX-1.2.md`.

From the card: presenting a refresh token that was already consumed by a rotation revokes every session for that user. Acceptance criteria:

- Presenting a consumed refresh token revokes every session for that user.
- A revoked session fails validation.

Note that this workspace has no database and no network, so anything touching `src/db/schema.ts` at runtime will throw.
