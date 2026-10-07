#!/usr/bin/env bash
#
# check-all-ci-bun.sh - check-all.sh fails, rather than skips, the board
# sections when CI is set and bun is not on PATH.
#
# CF-29: the board package's tests are skipped without bun, which is right on a
# machine that has no board, and wrong in CI, where a missing bun would turn the
# whole board section into a silent green. This runs a copy of check-all.sh in a
# scratch tree where every other section is a stub, with every PATH entry
# holding bun removed, and proves three things: with CI set the board install
# and board sections fail and the run exits 1; with CI unset they still skip and
# the run passes; with CI set and a bun present they run.
#
# Usage:  evals/lib/check-all-ci-bun.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
CHECK_ALL="$LIB_DIR/check-all.sh"
[ -f "$CHECK_ALL" ] || { printf 'check-all-ci-bun: missing %s\n' "$CHECK_ALL" >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-all-ci-bun.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

ROOT="$TMP/repo"
mkdir -p "$ROOT/claude/evals/lib" "$ROOT/claude/coder-fleet/hooks" "$ROOT/claude/coder-fleet/scripts" \
         "$ROOT/claude/coder-fleet/workflows" "$ROOT/claude/coder-fleet/board" \
         "$ROOT/claude/coder-fleet/.claude-plugin" "$ROOT/claude/scripts" "$ROOT/.claude-plugin" \
         "$TMP/withbun"

stub() { # $1 path, $2 body
    printf '#!/usr/bin/env bash\n%s\n' "$2" > "$1"
    chmod +x "$1"
}

cp "$CHECK_ALL" "$ROOT/claude/evals/lib/check-all.sh"
for f in "$LIB_DIR"/*.sh; do
    name=$(basename "$f")
    case "$name" in check-all.sh) continue ;; esac
    stub "$ROOT/claude/evals/lib/$name" 'exit 0'
done
for f in "$LIB_DIR"/*.mjs; do
    printf '\n' > "$ROOT/claude/evals/lib/$(basename "$f")"
done
stub "$ROOT/claude/coder-fleet/hooks/enforce-disabled-agents.sh" 'exit 0'
stub "$ROOT/claude/scripts/gen-glossary-rule.sh" 'exit 0'
stub "$ROOT/claude/scripts/gen-agent-pairs.sh" 'exit 0'
printf 'const x = 1;\n' > "$ROOT/claude/coder-fleet/workflows/stub.js"
printf '{"version":"1.0.0"}\n' > "$ROOT/claude/coder-fleet/.claude-plugin/plugin.json"
printf '{"plugins":[{"name":"coder-fleet","version":"1.0.0"}]}\n' > "$ROOT/.claude-plugin/marketplace.json"
stub "$TMP/withbun/bun" 'exit 0'
stub "$TMP/withbun/bunx" 'exit 0'

# Every PATH entry holding bun is dropped, so a developer's own bun cannot
# make the no-bun runs pass.
nobun_path=""
IFS=: read -ra dirs <<< "$PATH"
for p in "${dirs[@]}"; do
    [ -x "$p/bun" ] && continue
    nobun_path="${nobun_path:+$nobun_path:}$p"
done

unset CHECK_ALL_SERIAL CHECK_ALL_BOARD_FULL

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }

OUT_CI="$TMP/ci.out"
env CI=true PATH="$nobun_path" bash "$ROOT/claude/evals/lib/check-all.sh" < /dev/null > "$OUT_CI" 2>&1; STATUS_CI=$?
if [ "$STATUS_CI" -eq 1 ]; then
    pass 'CI set and no bun: the run exits 1'
else
    fail "CI set and no bun: the run exits 1 (got $STATUS_CI)"
fi
for s in 'board install' board; do
    if grep -Eq "^$s: FAILED \(" "$OUT_CI"; then
        pass "CI set and no bun: section '$s' fails"
    else
        fail "CI set and no bun: section '$s' fails"
    fi
done
if grep -Eq '^FAILED: .*board' "$OUT_CI"; then
    pass 'CI set and no bun: the closing FAILED line names the board'
else
    fail 'CI set and no bun: the closing FAILED line names the board'
fi

OUT_LOCAL="$TMP/local.out"
env -u CI PATH="$nobun_path" bash "$ROOT/claude/evals/lib/check-all.sh" < /dev/null > "$OUT_LOCAL" 2>&1; STATUS_LOCAL=$?
if [ "$STATUS_LOCAL" -eq 0 ]; then
    pass 'CI unset and no bun: the run still passes'
else
    fail "CI unset and no bun: the run still passes (got $STATUS_LOCAL)"
fi
for s in 'board install' board; do
    if grep -Eq "^$s: skipped \(" "$OUT_LOCAL"; then
        pass "CI unset and no bun: section '$s' skips"
    else
        fail "CI unset and no bun: section '$s' skips"
    fi
done

OUT_BUN="$TMP/bun.out"
env CI=true PATH="$TMP/withbun:$nobun_path" bash "$ROOT/claude/evals/lib/check-all.sh" < /dev/null > "$OUT_BUN" 2>&1; STATUS_BUN=$?
if [ "$STATUS_BUN" -eq 0 ] && grep -Eq '^board: ok \(' "$OUT_BUN"; then
    pass 'CI set and bun present: the board section runs and the run passes'
else
    fail "CI set and bun present: the board section runs and the run passes (got $STATUS_BUN)"
fi

if [ "$FAILED" -ne 0 ]; then
    printf '\n--- check-all output, CI set, no bun ---\n'; cat "$OUT_CI"
    printf '\n--- check-all output, CI unset, no bun ---\n'; cat "$OUT_LOCAL"
    printf '\n--- check-all output, CI set, bun present ---\n'; cat "$OUT_BUN"
    printf '\ncheck-all-ci-bun: check-all.sh does not fail the board sections for a missing bun in CI.\n'
    exit 1
fi
printf '\ncheck-all-ci-bun: check-all.sh fails the board sections for a missing bun when CI is set, and skips them otherwise.\n'
