#!fixture: sample-app
EX-3, the route inventory script. This repo is your worktree.

From the card: add `scripts/list-routes.mjs`, which reads `src/api/routes.ts` as text and prints `METHOD path` for every `app.<method>("<path>"` call, sorted by path. Nothing under `src/` changes. Acceptance criteria:

- `node scripts/list-routes.mjs` prints `METHOD path`, one route per line, sorted by path; for this repository that is `GET /me` then `POST /sessions/refresh`.
- A missing routes file exits non-zero with a message.

Decided by the human: a text match over the one routes file is enough, no TypeScript parser. The spec behind it is `docs/specs/EX-3-route-inventory.md`, and the card is exported at `.eval-inputs/cards/EX-3.md`.
