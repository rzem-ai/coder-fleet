#!/usr/bin/env bash
#
# shards-contract.sh - shards.sh fails a sharded contract whose copies did not
# split its cases, or whose cases failed, and passes one that did both right.
#
# shards.sh stands between the gate and every case in the two sharded hook
# contracts (CF-56), so a regression in it passes them silently (CF-56.1). This
# runs a toy contract through the real shards.sh, three shards of six sections
# with two cases each, and breaks it one way at a time: a failing case, a case
# every shard decides, a case only one non-owning shard sees, a section no
# shard owns, a shard that owns no section, one shard and then every shard
# dying before its tally. Each has to make the parent exit 1; the unbroken toy
# has to pass, sharded and unsharded.
#
# Usage:  evals/lib/shards-contract.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
[ -f "$LIB_DIR/shards.sh" ] || { printf 'shards-contract: missing %s\n' "$LIB_DIR/shards.sh" >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/shards-contract.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

TOY="$TMP/toy.sh"
cat > "$TOY" <<'TOY'
#!/usr/bin/env bash
# A toy sharded contract. TOY_MODE picks the way it is broken.
set -uo pipefail
. "$SHARDS_LIB"
case "${TOY_MODE:-}" in
    dropped)  # a split that gives section 4 to no shard
        in_shard() { [ "$SHARD_SECTION" -ne 4 ] && [ $((SHARD_SECTION % SHARD_COUNT)) -eq "$SHARD_INDEX" ]; } ;;
    idle)     # a split that hands shard 2's sections to shard 0
        in_shard() { local o=$((SHARD_SECTION % SHARD_COUNT)); [ "$o" -eq 2 ] && o=0; [ "$o" -eq "$SHARD_INDEX" ]; } ;;
esac
shard_dispatch TOY_SHARD "$0" "${TOY_SHARDS:-3}" "$@"
case "${TOY_MODE:-}" in
    dies-all) [ -n "${TOY_SHARD:-}" ] && exit 0 ;;
esac
PASSED=0; FAILED=0
check() {
    shard_skip && return 0
    if [ "$2" -eq 0 ]; then PASSED=$((PASSED + 1)); printf '  ok    %s\n' "$1"
    else FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; fi
}
for s in 1 2 3 4 5 6; do
    section "Section $s"
    check "s$s-a" 0
    if [ "${TOY_MODE:-}" = failing ] && [ "$s" = 2 ]; then check "s$s-b" 1; else check "s$s-b" 0; fi
    # Section 1 belongs to shard 1; shard 2 alone walks one more case in it.
    if [ "${TOY_MODE:-}" = unequal ] && [ "$s" = 1 ] && [ "$SHARD_INDEX" = 2 ]; then check s1-extra 0; fi
done
# A case decided outside shard_skip, so every shard counts it.
if [ "${TOY_MODE:-}" = double ]; then PASSED=$((PASSED + 1)); printf '  ok    everyone\n'; fi
if [ "${TOY_MODE:-}" = dies-one ] && [ "$SHARD_INDEX" = 1 ] && [ -n "${TOY_SHARD:-}" ]; then exit 0; fi
shard_tally "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
TOY
chmod +x "$TOY"

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }

# toy <mode> [shards]: runs the toy, leaving its exit code in RC and its
# output in $TMP/<mode>.out.
toy() {
    OUT="$TMP/$1.out"
    unset TOY_SHARD
    SHARDS_LIB="$LIB_DIR/shards.sh" TOY_MODE="$1" TOY_SHARDS="${2:-3}" "$TOY" > "$OUT" 2>&1
    RC=$?
}

expect() { # $1 mode, $2 wanted exit code, $3 what it proves
    toy "$1"
    if [ "$RC" -eq "$2" ]; then
        pass "$3"
    else
        fail "$3 (exit $RC, wanted $2)"
        sed 's/^/        /' "$OUT"
    fi
}

expect good 0 'an unbroken toy passes across 3 shards'
if grep -qx '12 passed, 0 failed, across 3 shards' "$TMP/good.out"; then
    pass 'the shards decide all 12 cases between them'
else
    fail 'the shards decide all 12 cases between them'
fi
toy good 1
if [ "$RC" -eq 0 ] && ! grep -q 'shard-tally\|across' "$OUT"; then
    pass 'a shard count of 1 runs the file unsharded'
else
    fail "a shard count of 1 runs the file unsharded (exit $RC)"
fi

expect failing  1 'a failing case inside a shard fails the run'
expect double   1 'a case every shard decides fails the split'
expect unequal  1 'shards that saw different totals fail the split'
expect dropped  1 'a section no shard owns fails the split'
expect idle     1 'a shard that decided nothing fails the split'
expect dies-one 1 'a shard that dies before its tally fails the run'
expect dies-all 1 'every shard dying before its tally fails the run'

if [ "$FAILED" -ne 0 ]; then
    printf '\nshards-contract: shards.sh lets a broken split or a failing case through.\n'
    exit 1
fi
printf '\nshards-contract: shards.sh fails every broken split and every failing case, and passes a sound one.\n'
