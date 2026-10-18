# todos

A server-rendered todo list: one page, plain HTML forms, state in memory.

## Stack

- Language and runtime: JavaScript on Node 22, ES modules, no dependencies
- Tests: node's built-in test runner

## Gates

```gates
test: node --test
```

## Where work lives

App start: node src/server.js
App url: http://localhost:4317

## Conventions

Every route that changes the list answers with a 303 back to `/`.
