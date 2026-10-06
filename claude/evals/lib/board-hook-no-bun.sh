#!/usr/bin/env bash
#
# board-hook-no-bun.sh - board-hook-contract.sh passes, sharded, on a machine
# with no bun and no installed board, the way CI's ubuntu runner sees it.
#
# PR #66's first CI run failed there and passed on the Mac it was built on.
# With no board to resolve, the live section's owning shard skips its cases,
# while the other shards walked them against the no-op board and counted them
# as skipped, so the shards disagreed on the total and the split check failed.
# This runs the contract with every PATH entry holding bun removed and HOME
# pointed at an empty directory, so the shim finds no ~/.local/bin/board, and
# asserts it passes and that the live section says it was skipped.
#
# Usage:  evals/lib/board-hook-no-bun.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
PLUGIN_ROOT=$(cd "$LIB_DIR/../../coder-fleet" && pwd)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/board-hook-no-bun.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/home"

nobun_path=""
IFS=':' read -ra parts <<< "$PATH"
for p in "${parts[@]}"; do
    [ -x "$p/bun" ] && continue
    nobun_path="${nobun_path:+$nobun_path:}$p"
done

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }

# The shape has to be real: with this PATH and HOME the shim resolves nothing.
if PATH="$nobun_path" HOME="$TMP/home" "$PLUGIN_ROOT/board/board.sh" --version >/dev/null 2>&1; then
    fail 'the board shim resolves nothing with bun hidden and an empty HOME'
else
    pass 'the board shim resolves nothing with bun hidden and an empty HOME'
fi

OUT="$TMP/out"
PATH="$nobun_path" HOME="$TMP/home" BOARD_HOOK_SHARDS=4 "$LIB_DIR/board-hook-contract.sh" > "$OUT" 2>&1
rc=$?

if [ "$rc" -eq 0 ]; then
    pass 'board-hook-contract.sh passes across 4 shards with no board'
else
    fail "board-hook-contract.sh passes across 4 shards with no board (exit $rc)"
    grep -E '^  FAIL|shards did not' "$OUT" | head -20
fi
if grep -q '^  skipped: board not resolvable' "$OUT"; then
    pass 'the live section says it was skipped'
else
    fail 'the live section says it was skipped'
fi

if [ "$FAILED" -ne 0 ]; then
    printf '\nboard-hook-no-bun: the sharded board-hook contract does not hold on a machine with no board.\n'
    exit 1
fi
printf '\nboard-hook-no-bun: the sharded board-hook contract holds on a machine with no board.\n'
