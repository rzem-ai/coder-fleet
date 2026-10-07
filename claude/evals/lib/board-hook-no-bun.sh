#!/usr/bin/env bash
#
# board-hook-no-bun.sh - board-hook-contract.sh passes, sharded, on a machine
# with no bun and no installed board, the way CI's ubuntu runner sees it.
#
# PR #66's first CI run failed there and passed on the Mac it was built on.
# With no board to resolve, the live section's owning shard skips its cases,
# while the other shards walked them against the no-op board and counted them
# as skipped, so the shards disagreed on the total and the split check failed.
# This runs the contract with bun hidden on PATH and HOME pointed at an empty
# directory, so the shim finds no ~/.local/bin/board, and asserts it passes
# and that the live section says it was skipped. Only bun is hidden, not the
# directory it is in, which on a Homebrew install also holds jq and python3
# (CF-56.1).
#
# Usage:  evals/lib/board-hook-no-bun.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
PLUGIN_ROOT=$(cd "$LIB_DIR/../../coder-fleet" && pwd)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/board-hook-no-bun.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/home"

# hide_bun <path> <dir>: prints <path> with bun hidden. A directory holding bun
# is replaced, in its place, by a directory under <dir> of symlinks to
# everything else in it, so jq and python3 beside bun in a Homebrew bin stay
# reachable. bunx is bun under another name and goes with it.
hide_bun() {
    local out="" p e n=0 parts
    IFS=':' read -ra parts <<< "$1"
    for p in "${parts[@]}"; do
        if [ -x "$p/bun" ]; then
            n=$((n + 1))
            mkdir -p "$2/$n"
            for e in "$p"/* "$p"/.[!.]*; do
                [ -e "$e" ] || [ -L "$e" ] || continue
                case "${e##*/}" in bun|bunx) continue ;; esac
                ln -s "$e" "$2/$n/${e##*/}"
            done
            p="$2/$n"
        fi
        out="${out:+$out:}$p"
    done
    printf '%s' "$out"
}

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }

# bun and jq in one directory, the way Homebrew installs them: jq has to stay
# reachable and bun must not.
mkdir -p "$TMP/shared"
printf '#!/bin/sh\nexit 0\n' > "$TMP/shared/bun"
printf '#!/bin/sh\nexit 0\n' > "$TMP/shared/jq"
chmod +x "$TMP/shared/bun" "$TMP/shared/jq"
fixture_path=$(hide_bun "$TMP/shared:/usr/bin:/bin" "$TMP/fixture-shims")
found=$(PATH="$fixture_path" command -v jq)
case "$found" in
    "$TMP/"*) pass 'jq beside bun in one directory stays on PATH' ;;
    *) fail "jq beside bun in one directory stays on PATH (found '$found')" ;;
esac
if PATH="$fixture_path" command -v bun >/dev/null 2>&1; then
    fail 'bun beside jq in one directory is hidden'
else
    pass 'bun beside jq in one directory is hidden'
fi

nobun_path=$(hide_bun "$PATH" "$TMP/shims")
for tool in jq python3; do
    command -v "$tool" >/dev/null 2>&1 || continue
    if PATH="$nobun_path" command -v "$tool" >/dev/null 2>&1; then
        pass "$tool is still on PATH with bun hidden"
    else
        fail "$tool is still on PATH with bun hidden"
    fi
done

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
