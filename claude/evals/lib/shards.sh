#!/usr/bin/env bash
#
# shards.sh - run a contract file as several copies of itself that split its
# cases between them. Sourced, never run.
#
# A contract that makes hundreds of hook calls spends most of check-all's
# budget on its own (CF-56). Sharded, each copy builds every fixture and walks
# every line, but decides only the cases in its own sections, taken round robin
# by `section`. Every copy counts the cases it skipped as well as the ones it
# decided, so the parent proves the copies split the cases: each saw the same
# total, and the ones they decided add up to it.
#
#   . "$LIB_DIR/shards.sh"
#   shard_dispatch NAME_SHARD "$LIB_DIR/name.sh" "${NAME_SHARDS:-4}" "$@"
#       Outside a shard, with a count above 1: runs the copies, each with
#       NAME_SHARD=i/N in its environment, prints their output in order,
#       checks the split and exits. Inside a shard, or with a count of 1:
#       returns, and the file runs as it always did.
#   section TITLE      starts the next group of cases; only its shard prints
#                      the title. Calls on_section, if the file defines one.
#   in_shard           true while the current section is this copy's.
#   shard_skip         true, counting the case as skipped, when it is not.
#                      Every function that decides a case calls it first.
#   shard_tally P F    prints the line the parent reads; a no-op unsharded.

SHARD_INDEX=0
SHARD_COUNT=1
SHARD_SECTION=0
SHARD_SKIPPED=0
SHARD_VAR=""

shard_dispatch() {
    local var="$1" self="$2" count="$3"
    shift 3
    SHARD_VAR="$var"
    case "$count" in ''|*[!0-9]*|0)
        printf '%s: the shard count must be a whole number above 0, not %s\n' "$(basename "$self")" "$count" >&2
        exit 2 ;;
    esac
    local mine="${!var:-}"
    if [ -n "$mine" ]; then
        SHARD_INDEX="${mine%/*}"
        SHARD_COUNT="${mine#*/}"
        return 0
    fi
    [ "$count" -gt 1 ] || return 0

    local dir i rc tally seen="" decided=0 passed=0 failed=0 split_ok=1 total
    local pids=()
    dir=$(mktemp -d "${TMPDIR:-/tmp}/shards.XXXXXX") || exit 2
    for (( i = 0; i < count; i++ )); do
        env "$var=$i/$count" "$self" "$@" > "$dir/$i.out" 2>&1 &
        pids+=("$!")
    done
    for (( i = 0; i < count; i++ )); do
        wait "${pids[$i]}"
        rc=$?
        printf '\n--- shard %s of %s ---\n' "$((i + 1))" "$count"
        grep -v '^shard-tally ' "$dir/$i.out"
        tally=$(sed -n 's/^shard-tally //p' "$dir/$i.out" | tail -n 1)
        set -- $tally
        if [ "$#" -ne 3 ]; then
            printf '  FAIL  shard %s exited %s without its tally, so its cases cannot be counted\n' "$((i + 1))" "$rc"
            split_ok=0; failed=$((failed + 1)); continue
        fi
        passed=$((passed + $1)); failed=$((failed + $2))
        decided=$((decided + $1 + $2))
        total=$(($1 + $2 + $3))
        if [ -z "$seen" ]; then seen=$total
        elif [ "$total" -ne "$seen" ]; then split_ok=0; fi
        [ $(($1 + $2)) -gt 0 ] || split_ok=0
    done
    rm -rf "$dir"
    if [ "$split_ok" -ne 1 ] || [ "$decided" -ne "${seen:-0}" ]; then
        printf '\n  FAIL  the shards did not split the cases: each should see the same total and decide its own share, and they decided %s of %s\n' "$decided" "${seen:-0}"
        failed=$((failed + 1))
    fi
    printf '\n%s passed, %s failed, across %s shards\n' "$passed" "$failed" "$count"
    [ "$failed" -eq 0 ] && exit 0
    exit 1
}

section() {
    SHARD_SECTION=$((SHARD_SECTION + 1))
    if declare -F on_section >/dev/null; then on_section; fi
    in_shard && printf '\n%s\n' "$1"
    return 0
}

in_shard() { [ $((SHARD_SECTION % SHARD_COUNT)) -eq "$SHARD_INDEX" ]; }

shard_skip() {
    in_shard && return 1
    SHARD_SKIPPED=$((SHARD_SKIPPED + 1))
    return 0
}

shard_tally() {
    [ -n "$SHARD_VAR" ] && [ -n "${!SHARD_VAR:-}" ] || return 0
    printf 'shard-tally %s %s %s\n' "$1" "$2" "$SHARD_SKIPPED"
}
