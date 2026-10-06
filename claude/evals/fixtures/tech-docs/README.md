# catalogue-cache

Warms the product catalogue cache after a deploy, so the first requests after it read from the cache instead of the database.

## Warming the cache

Run `npm run warm-cache`. Keys stay cached for 15 minutes by default; pass `--ttl <minutes>` to change that, for example `npm run warm-cache -- --ttl 60`. Pass `--dry-run` to count the keys without writing them.

The command writes keys in batches of 500 and prints `warmed <n> keys` when it is done.
