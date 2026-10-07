#!/usr/bin/env bash
#
# board-hook-unsharded.sh - board-hook-contract.sh passes in one process.
#
# check-all.sh runs the contract as four shards (CF-56), and a shard decides
# only its own sections, against no-op hooks and a no-op board everywhere else.
# BOARD_HOOK_SHARDS=1 runs every section against the real hooks in order, so
# one section's hook output changing a later section's result shows here and
# not in a sharded run, where the earlier hook was a no-op. It also keeps the
# unsharded path itself working. check-slow.sh runs this once (CF-56.1).
#
# Usage:  evals/lib/board-hook-unsharded.sh [-v]

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
BOARD_HOOK_SHARDS=1 exec "$LIB_DIR/board-hook-contract.sh" "$@"
