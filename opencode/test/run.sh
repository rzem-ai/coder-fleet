#!/usr/bin/env bash
#
# run.sh - the OpenCode port's invariant tests, in the two shapes the repo's
# suites run them.
#
#   unit    scope.test.ts, the enforcement rules in coder-fleet/lib/scope.ts
#           called directly, vendored.test.ts, every vendored skill against
#           its source in claude/coder-fleet/skills/, and config.test.ts, the
#           two opencode.json files in the 2.x config shape. No OpenCode
#           binary, no model, no network, well under a second. check-all.sh
#           runs it
#   live    rulesets.test.ts and live.test.ts: every body's merged ruleset as
#           a real OpenCode reports it, and every denial site in scope.ts end
#           to end through a running OpenCode against a mock endpoint. Needs
#           the OpenCode binary at $OPENCODE_BIN (default
#           ~/.opencode/bin/opencode), the 2.x release the port targets.
#           check-slow.sh runs it
#
# Without bun, or for `live` without the binary, a run skips on a developer's
# machine and fails when CI is set, so a missing tool is never a silent green.
# XDG_CONFIG_HOME points at a scratch directory for the whole run: OpenCode
# merges the user's global config into every session, and a real token
# reference in it fails config load before a test starts.
#
# Usage:  opencode/test/run.sh unit|live [-v]

set -uo pipefail

MODE="${1:-}"
HERE=$(cd "$(dirname "$0")" && pwd)
PORT_ROOT=$(cd "$HERE/.." && pwd)
OPENCODE_VERSION=2.0.32
export OPENCODE_BIN="${OPENCODE_BIN:-$HOME/.opencode/bin/opencode}"

missing() { # $1 what is missing
    if [ -n "${CI:-}" ]; then
        printf '%s, and CI is set, so the OpenCode %s tests cannot run: install it in the workflow\n' "$1" "$MODE"
        exit 1
    fi
    printf '%s, so the OpenCode %s tests are skipped\n' "$1" "$MODE"
    [ -n "${CHECK_ALL_SKIP_FILE:-}" ] && : > "$CHECK_ALL_SKIP_FILE"
    exit 0
}

case "$MODE" in
    unit)  FILES=(test/invariants/scope.test.ts test/invariants/vendored.test.ts test/invariants/config.test.ts) ;;
    live)  FILES=(test/invariants/rulesets.test.ts test/invariants/live.test.ts) ;;
    *) printf 'usage: %s unit|live\n' "$0" >&2; exit 2 ;;
esac

command -v bun >/dev/null 2>&1 || missing 'bun is not on PATH'
if [ "$MODE" = live ]; then
    [ -x "$OPENCODE_BIN" ] || missing "no OpenCode binary at $OPENCODE_BIN"
    # 2.x prints "opencode v2.0.32"; the version is the last word, less its v.
    have=$("$OPENCODE_BIN" --version 2>/dev/null | tail -1 | awk '{print $NF}')
    have=${have#v}
    if [ "$have" != "$OPENCODE_VERSION" ]; then
        printf 'OpenCode at %s is %s, not %s: the tests read behaviour of that version\n' "$OPENCODE_BIN" "${have:-unknown}" "$OPENCODE_VERSION"
        exit 1
    fi
fi

SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opencode-tests.XXXXXX")
trap 'rm -rf "$SCRATCH"' EXIT
cd "$PORT_ROOT" && XDG_CONFIG_HOME="$SCRATCH" bun test --timeout=60000 "${FILES[@]}"
