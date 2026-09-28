# ex-service

A deliberately small Fastify service used as the workspace for the fleet's
smoke evals. It is not a real product and nothing here ships. Every eval run
gets its own throwaway copy, so an agent may change files freely - and whether
it did is part of what the eval measures.

- `src/auth/session.ts` - session issue, refresh and validation.
- `src/api/routes.ts` - the two routes that use it.
- `src/db/schema.ts` - the Drizzle table behind it.
- `docs/specs/` - specs, as the glossary defines them.
- There is no board here. The eval workspace has no `.boards/` of its own, so the cards for EX-1 to EX-3 arrive in the prompt or as board exports under `.eval-inputs/cards/`.

Run the tests with `npm test`. There is no network and no database in the eval
workspace, so anything needing either cannot be run here.
