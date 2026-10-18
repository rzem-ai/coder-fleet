# todos

A deliberately small, dependency-free Node app used as the workspace for the evaluator's smoke evals. It is not a real product and nothing here ships. Every eval run gets its own throwaway copy.

- `src/server.js` - one server-rendered page with plain HTML forms, on port 4317 unless `PORT` is set.
- `src/todos.js` - the list.
- `test/` - its tests, run with `node --test`.

Nothing to install and no network: `node src/server.js` starts it on a bare checkout.
