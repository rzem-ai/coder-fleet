# The cache warm-up command

`npm run warm-cache` fills the catalogue cache ahead of traffic, so the first visitors after a deploy do not pay for the misses.

## Options

- `--max-age <minutes>` sets how long each warmed key stays cached. The default is 15 minutes.
- `--dry-run` counts the keys the command would warm and writes nothing.

## How it works

The command reads every catalogue key and writes the keys to the store in batches of 200. It warms 10,000 keys per second against the production store, so a full catalogue is cached in under a minute.

When it finishes it prints `warmed <n> keys`. If a batch fails it prints `warm-up failed:` and the error, and exits with status 1.
