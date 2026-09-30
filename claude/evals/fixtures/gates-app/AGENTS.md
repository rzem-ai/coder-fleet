# price-service

Prices and discounts for the checkout, in integer cents.

## Stack

- Language and runtime: JavaScript on Node 22, ES modules, no dependencies
- Tests: node's built-in test runner

## Gates

```gates
test: node --test
syntax: node --check src/prices.js
```

## Conventions

Money is integer cents everywhere. A fraction of a cent rounds half up.
