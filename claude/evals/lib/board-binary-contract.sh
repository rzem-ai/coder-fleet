#!/usr/bin/env bash
#
# board-binary-contract.sh - the plugin fetches its own board binary.
#
# hooks/board-binary.sh fetches the release build for the plugin's version and
# platform into ${CLAUDE_PLUGIN_DATA}/bin at session start, checked against the
# release's SHA256SUMS, and board/board.sh runs it in preference to anything
# else. The release workflow builds exactly the platforms the hook asks for.
#
# Offline: the release is a file:// tree under a temporary directory, through
# CODER_FLEET_BOARD_RELEASE_URL, and the fake binary is a shell script that
# says which one it is. No network, no bun, no real board.
#
# Usage:  claude/evals/lib/board-binary-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
HOOK="$PLUGIN_ROOT/hooks/board-binary.sh"
SHIM="$PLUGIN_ROOT/board/board.sh"
WORKFLOW="$REPO_ROOT/.github/workflows/board-binaries.yml"

command -v jq >/dev/null 2>&1 || { printf 'board-binary-contract: jq is needed\n' >&2; exit 2; }
VERSION=$(jq -r .version "$PLUGIN_ROOT/.claude-plugin/plugin.json")

TMP=$(mktemp -d "${TMPDIR:-/tmp}/board-binary-contract.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0
check() {
    # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
    fi
    return 0
}

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# make_release <dir> <platform asset name, e.g. board-linux-x64> <tag line> -
# a release for VERSION holding one gzipped fake binary and its SHA256SUMS.
make_release() {
    local rel="$1/v$VERSION" name="$2" body
    mkdir -p "$rel"
    body="$TMP/$name.body"
    printf '#!/bin/sh\necho "%s $*"\n' "$3" > "$body"
    gzip -9 -c "$body" > "$rel/$name.gz"
    printf '%s  %s\n' "$(sha "$rel/$name.gz")" "$name.gz" > "$rel/SHA256SUMS"
}

# fetch <data dir> <release dir> [VAR=value ...] -> RC, and the log in $LOG
LOG="$TMP/hooks.log"
fetch() {
    local data="$1" rel="$2"; shift 2
    : > "$LOG"
    RC=0
    env -u CODER_FLEET_BOARD_DOWNLOAD -u CODER_FLEET_BOARD_PLATFORM \
        CLAUDE_PLUGIN_DATA="$data" CODER_FLEET_BOARD_RELEASE_URL="file://$rel" \
        CODER_FLEET_BOARD_PLATFORM=linux-x64 BOARD_LOG_FILE="$LOG" CODER_FLEET_STATE_DIR="$TMP/state" "$@" \
        bash "$HOOK" </dev/null >"$TMP/out" 2>&1 || RC=$?
}
log_has() { grep -qF "$1" "$LOG"; }

printf '\nThe hook fetches, checks and installs the release build\n'

R1="$TMP/r1"; D1="$TMP/d1"
make_release "$R1" board-linux-x64 fresh
mkdir -p "$D1/bin"; printf 'old\n' > "$D1/bin/board-0.0.1"; chmod +x "$D1/bin/board-0.0.1"
fetch "$D1" "$R1"
check 'it exits 0'                                  test "$RC" -eq 0
check 'it installs board-<version> in the data dir' test -x "$D1/bin/board-$VERSION"
check 'it installs the unpacked binary'             grep -q 'echo "fresh' "$D1/bin/board-$VERSION"
check 'it logs what it installed'                   log_has "installed the board binary for v$VERSION (linux-x64)"
check 'it removes an older version'                 test ! -e "$D1/bin/board-0.0.1"
check 'it leaves no lock or work directory'         test -z "$(find "$D1/bin" -name '.fetch*' 2>/dev/null)"

rm -rf "$R1"
fetch "$D1" "$R1"
check 'a second session fetches nothing and logs nothing' sh -c "[ $RC -eq 0 ] && [ ! -s '$LOG' ] && [ -x '$D1/bin/board-$VERSION' ]"

printf '\nThe shim runs it\n'
mkdir -p "$TMP/home/.local/bin"
printf '#!/bin/sh\necho stale\n' > "$TMP/home/.local/bin/board"; chmod +x "$TMP/home/.local/bin/board"
out=$(env HOME="$TMP/home" CLAUDE_PLUGIN_DATA="$D1" BOARD_LOG_FILE="$LOG" "$SHIM" --version 2>&1)
check 'the shim runs the release build for this version' test "$out" = "fresh --version"
check 'and never the old ~/.local/bin/board'             sh -c "! printf '%s' '$out' | grep -q stale"

printf '\nIt installs nothing it cannot check\n'

R2="$TMP/r2"; D2="$TMP/d2"
make_release "$R2" board-linux-x64 tampered
printf '%s  %s\n' "$(printf 'x' | (sha256sum 2>/dev/null || shasum -a 256) | cut -d' ' -f1)" board-linux-x64.gz > "$R2/v$VERSION/SHA256SUMS"
fetch "$D2" "$R2"
check 'a checksum mismatch exits 0'          test "$RC" -eq 0
check 'and installs nothing'                 test ! -e "$D2/bin/board-$VERSION"
check 'and says the checksum did not match'  log_has 'does not match its line in SHA256SUMS'

R3="$TMP/r3"; D3="$TMP/d3"
mkdir -p "$R3"
fetch "$D3" "$R3"
check 'a release not published yet exits 0' test "$RC" -eq 0
check 'and installs nothing'                 test ! -e "$D3/bin/board-$VERSION"
check 'and says it could not fetch'          log_has 'could not fetch'

R4="$TMP/r4"; D4="$TMP/d4"
make_release "$R4" board-linux-x64 nosums
rm -f "$R4/v$VERSION/SHA256SUMS"
fetch "$D4" "$R4"
check 'a release with no SHA256SUMS installs nothing' test ! -e "$D4/bin/board-$VERSION"

printf '\nPlatforms\n'

R5="$TMP/r5"; D5="$TMP/d5"
make_release "$R5" board-windows-arm64.exe win
fetch "$D5" "$R5" CODER_FLEET_BOARD_PLATFORM=windows-arm64
check 'Windows gets board-<version>.exe' test -x "$D5/bin/board-$VERSION.exe"
out=$(env HOME="$TMP/home" CLAUDE_PLUGIN_DATA="$D5" BOARD_LOG_FILE="$LOG" "$SHIM" --version 2>&1)
check 'and the shim runs the .exe'      test "$out" = "win --version"

D6="$TMP/d6"
fetch "$D6" "$R5" CODER_FLEET_BOARD_PLATFORM=darwin-x64
check 'macOS on Intel exits 0 with nothing installed' sh -c "[ $RC -eq 0 ] && [ -z \"\$(ls '$D6/bin' 2>/dev/null | grep '^board-')\" ]"
check 'and says there is no build for it'             log_has 'no released board binary for darwin-x64'
fetch "$D6" "$R5" CODER_FLEET_BOARD_PLATFORM=darwin-x64
check 'and says so only once'                         test ! -s "$LOG"

printf '\nSwitches\n'

R7="$TMP/r7"; D7="$TMP/d7"
make_release "$R7" board-linux-x64 off
fetch "$D7" "$R7" CODER_FLEET_BOARD_DOWNLOAD=off
check 'CODER_FLEET_BOARD_DOWNLOAD=off fetches nothing' test ! -e "$D7/bin/board-$VERSION"

RC=0
env -u CLAUDE_PLUGIN_DATA CODER_FLEET_BOARD_RELEASE_URL="file://$R7" CODER_FLEET_BOARD_PLATFORM=linux-x64 \
    BOARD_LOG_FILE="$LOG" CODER_FLEET_STATE_DIR="$TMP/state" bash "$HOOK" </dev/null >/dev/null 2>&1 || RC=$?
check 'outside Claude Code, with no data dir, it exits 0' test "$RC" -eq 0

D8="$TMP/d8"
mkdir -p "$D8/bin/.fetch.lock"
fetch "$D8" "$R7"
check 'a fetch in progress elsewhere is left to finish' sh -c "[ ! -e '$D8/bin/board-$VERSION' ] && grep -qF 'another session is fetching' '$LOG'"

printf '\nRegistration and the release workflow agree with the hook\n'

check 'hooks.json runs board-binary.sh on SessionStart' \
    jq -e '[.hooks.SessionStart[]?.hooks[]?.command] | any(test("board-binary\\.sh"))' "$PLUGIN_ROOT/hooks/hooks.json"
check 'the hook is executable'                           test -x "$HOOK"
# The platforms the hook asks for are exactly the assets the workflow builds.
hook_platforms=$(sed -n 's/^  \(darwin-arm64|linux-x64|linux-arm64\|windows-x64|windows-arm64\)) ext=.*/\1/p' "$HOOK" | tr '|' '\n' | sort | tr '\n' ' ')
workflow_platforms=$(sed -n 's/^ *asset: board-\([a-z0-9-]*\)\(\.exe\)\{0,1\}$/\1/p' "$WORKFLOW" | sort | tr '\n' ' ')
check 'the workflow builds exactly the platforms the hook fetches' test -n "$hook_platforms" -a "$hook_platforms" = "$workflow_platforms"
check 'the workflow builds no macOS Intel binary'        sh -c "! grep -q 'darwin-x64' '$WORKFLOW'"
check 'the workflow builds on vX.Y.Z tags'               grep -qF "tags: ['v*']" "$WORKFLOW"
check 'the workflow attaches SHA256SUMS'                 grep -qF 'assets/SHA256SUMS' "$WORKFLOW"
check 'the workflow gzips what it attaches'              grep -qF 'gzip -9 -c' "$WORKFLOW"
check 'the build script takes a compile target'          grep -qF 'BOARD_BUILD_TARGET' "$PLUGIN_ROOT/board/scripts/build.ts"
check 'install-home.sh no longer builds the board'       sh -c "! grep -q 'build.sh' '$HARNESS_ROOT/scripts/install-home.sh'"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The plugin cannot be relied on to fetch its own board binary.\n'
    exit 1
fi
printf 'The plugin fetches, checks and runs the release build of its board binary.\n'
