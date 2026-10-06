# Runbook: warming the catalogue cache

Run this after a deploy that clears the cache, or when catalogue pages are slow because most reads miss.

## Run it

```
npm run warm-cache
```

The command writes every catalogue key to the cache in batches of 200 and prints `warmed <n> keys` when it finishes. Each key stays cached for 15 minutes unless you pass `--max-age` with a number of minutes:

```
npm run warm-cache -- --max-age 60
```

To count the keys without writing anything, pass `--dry-run`.

## When it fails

A failed run prints `warm-up failed:` followed by the error and exits with status 1. Nothing rolls back a batch already written, so the keys warmed before the failure stay cached.

## Check first

1. Whether the cache store is reachable. Every write goes through `setMany` in `src/store.js`.
2. Whether the run was a dry run. A dry run prints the same `warmed <n> keys` line and writes nothing.
