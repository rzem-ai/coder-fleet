#!/usr/bin/env bash
#
# human-name-contract.sh - hooks/human-name.sh, the SessionStart hook that
# tells the lead the human's name from boards/human-name under the user's
# config directory, or tells it to ask when none is stored or the stored one
# is unusable (CF-38).
#
# Each case runs the hook with its own HOME and XDG_CONFIG_HOME under this
# test's temporary directory, parses its stdout as JSON and reads the
# SessionStart additionalContext.
#
# Usage:  claude/evals/lib/human-name-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HOOK="$(cd "$LIB_DIR/../.." && pwd)/coder-fleet/hooks/human-name.sh"

command -v python3 >/dev/null 2>&1 || { printf 'human-name-contract: python3 is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/human-name-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0
ok() { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
bad() {
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' "$1"
    [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 8
    return 0
}

N=0
CTX=""
RC=0
# run <home> [xdg]: runs the hook; CTX is the additionalContext, or BAD-JSON.
run() {
    local out
    if [ -n "${2:-}" ]; then
        out=$(printf '{"source":"startup"}' | env HOME="$1" XDG_CONFIG_HOME="$2" "$HOOK")
    else
        out=$(printf '{"source":"startup"}' | env -u XDG_CONFIG_HOME HOME="$1" "$HOOK")
    fi
    RC=$?
    CTX=$(printf '%s' "$out" | python3 -I -c '
import json, sys
o = json.load(sys.stdin)["hookSpecificOutput"]
assert o["hookEventName"] == "SessionStart"
print(o["additionalContext"])' 2>/dev/null) || CTX="BAD-JSON: $out"
}
home() { N=$((N + 1)); H="$TMP/h$N"; mkdir -p "$H/.config/boards"; }
has() { # $1 label, $2 fixed text CTX must hold
    case "$CTX" in *"$2"*) ok "$1" ;; *) bad "$1" "rc $RC; want: $2
got: $CTX" ;; esac
}
lacks() { # $1 label, $2 fixed text CTX must not hold
    case "$CTX" in *"$2"*) bad "$1" "got: $CTX" ;; *) ok "$1" ;; esac
}

# No file: the lead is told to ask, with the path to write.
home
run "$H"
[ "$RC" = 0 ] && ok "missing: exits 0" || bad "missing: exits 0" "rc $RC"
has "missing: says none is stored" "no name for the human is stored at $H/.config/boards/human-name"
has "missing: asks with AskUserQuestion" "ask for it once with AskUserQuestion"

# A stored name: first line, trimmed, and the naming rule.
home
printf '  Alex \nsecond line\n' > "$H/.config/boards/human-name"
run "$H"
has "stored: names the human" "the human's name is Alex, from $H/.config/boards/human-name."
has "stored: names Claude and the human" "say \"Claude\" for yourself and \"Alex\" for the human"
has "stored: forbids the pronouns" "never I, we, me or you"
lacks "stored: reads the first line only" "second line"
lacks "stored: does not ask" "ask for it once"

# No trailing newline and a CRLF line both read.
home
printf 'Sam' > "$H/.config/boards/human-name"
run "$H"
has "stored: no trailing newline" "the human's name is Sam,"
home
printf 'Sam Lee\r\n' > "$H/.config/boards/human-name"
run "$H"
has "stored: CRLF line" "the human's name is Sam Lee,"

# XDG_CONFIG_HOME, when absolute, is where the name lives; a relative one is ignored.
home
mkdir -p "$TMP/xdg$N/boards"
printf 'Robin\n' > "$TMP/xdg$N/boards/human-name"
run "$H" "$TMP/xdg$N"
has "xdg: absolute XDG_CONFIG_HOME is read" "the human's name is Robin, from $TMP/xdg$N/boards/human-name."
home
printf 'Kim\n' > "$H/.config/boards/human-name"
run "$H" "relative/xdg"
has "xdg: relative XDG_CONFIG_HOME is ignored" "the human's name is Kim,"

# Unusable names never reach the session, and the lead is told to ask again.
unusable() { # $1 label, $2 file content (printf %s), $3 text that must not appear
    home
    printf '%s' "$2" > "$H/.config/boards/human-name"
    run "$H"
    has "unusable $1: says so" "is not usable"
    has "unusable $1: asks again" "ask for it once with AskUserQuestion"
    [ -n "${3:-}" ] && lacks "unusable $1: text kept out" "$3"
}
unusable "empty" ''
unusable "blank line" $'   \n'
unusable "quote" $'Al"ex\n' 'Al"ex'
unusable "backslash" $'Al\\ex\n' 'Al\ex'
unusable "angle bracket" $'<b>Alex\n' '<b>'
unusable "backtick" $'`id`\n' '`id`'
unusable "control character" $'Al\aex\n' $'Al\aex'
unusable "65 characters" "$(printf 'A%.0s' $(seq 1 65))" "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
home
printf '%s\n' "$(printf 'B%.0s' $(seq 1 64))" > "$H/.config/boards/human-name"
run "$H"
has "64 characters: usable" "the human's name is BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB,"

# A config path with a quote and a backslash still gives valid JSON.
home
odd="$TMP/x\"y\\z"
mkdir -p "$odd/boards"
printf 'Lee\n' > "$odd/boards/human-name"
run "$H" "$odd"
has "odd path: valid JSON, path intact" "the human's name is Lee, from $odd/boards/human-name."

printf '%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
