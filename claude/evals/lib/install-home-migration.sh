#!/usr/bin/env bash
#
# install-home-migration.sh - prove install-home.sh migrates a machine still
# on the old name, per "Machines already running the fleet" in the coder-fleet
# migration design and Task 4 of its task list. Both files were deleted in
# CF-58 and are in git history before commit 612f84f.
#
# The migration is one step now: repointing the rzem marketplace. The secrets
# directory move and the board.env warning went with the 1Password rendering
# and board.env themselves, so the last cases here check that a run leaves
# both old directories alone and never calls op.
#
# Everything here runs against a temporary HOME under ${TMPDIR:-/tmp} and
# never touches the real ~/.config or ~/.claude. Most cases source
# install-home.sh with INSTALL_HOME_LIB=1, which makes it define its functions
# and return before the main flow runs, so repoint_marketplace can be called
# directly. The end-to-end cases near the bottom run the script itself, with
# --dry-run and for real.
#
# Usage:  evals/lib/install-home-migration.sh

set -euo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)
HARNESS_ROOT=$(cd "$EVAL_ROOT/.." && pwd)
INSTALL_SCRIPT="$HARNESS_ROOT/scripts/install-home.sh"

FAILED=0
fail() { printf 'FAIL: %s\n' "$*" >&2; FAILED=1; }
pass() { printf 'ok: %s\n' "$*"; }

# run_repoint <HOME> [install-home.sh args...] - source install-home.sh under
# that HOME and call repoint_marketplace once. Any arguments after HOME (e.g.
# --dry-run) are passed to the sourced script itself, so its own
# argument-parsing loop sets DRY_RUN exactly as a real invocation would.
# Prints whatever the function prints.
run_repoint() {
    local home="$1"; shift
    (
        HOME="$home"
        INSTALL_HOME_LIB=1
        # Sourcing passes "$@" on as the sourced script's own positional
        # parameters; with none left after the shift above, that is an empty
        # list rather than a leak of this function's own arguments.
        # shellcheck disable=SC1090
        source "$INSTALL_SCRIPT" "$@"
        repoint_marketplace
    )
}

# old_marketplace <file> - a settings.json still pointing at the old repo.
old_marketplace() {
    cat > "$1" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/claudecode-agents" } }
  },
  "enabledPlugins": { "claudecode-agents@rzem": true }
}
JSON
}

T=$(mktemp -d "${TMPDIR:-/tmp}/install-home-migration.XXXXXX")
trap 'rm -rf "$T"' EXIT

# --- The marketplace source is repointed ---

T1="$T/case1"
mkdir -p "$T1/.claude"
old_marketplace "$T1/.claude/settings.json"
run_repoint "$T1" >"$T/case1-output.txt" 2>&1 || { fail "repoint_marketplace exited non-zero on case 1"; cat "$T/case1-output.txt" >&2; }
repo=$(jq -r '.extraKnownMarketplaces.rzem.source.repo' "$T1/.claude/settings.json")
if [ "$repo" = rzem-ai/coder-fleet ]; then
    pass "repoints extraKnownMarketplaces.rzem.source.repo to rzem-ai/coder-fleet"
else
    fail "extraKnownMarketplaces.rzem.source.repo is '$repo', expected rzem-ai/coder-fleet"
fi

# --- A settings.json already on the new name, or with no rzem entry at all,
# is untouched byte-for-byte ---

T3="$T/case3-already-new"
mkdir -p "$T3/.claude"
cat > "$T3/.claude/settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "rzem": { "source": { "source": "github", "repo": "rzem-ai/coder-fleet" } }
  }
}
JSON
cp "$T3/.claude/settings.json" "$T/case3-before.json"
run_repoint "$T3" >/dev/null 2>&1 || { fail "repoint_marketplace exited non-zero on case 3"; }
if cmp -s "$T3/.claude/settings.json" "$T/case3-before.json"; then
    pass "leaves a settings.json already on rzem-ai/coder-fleet byte-identical"
else
    fail "a settings.json already on the new name was rewritten"
fi

T4="$T/case4-no-rzem"
mkdir -p "$T4/.claude"
printf '{\n  "model": "opus"\n}\n' > "$T4/.claude/settings.json"
cp "$T4/.claude/settings.json" "$T/case4-before.json"
run_repoint "$T4" >/dev/null 2>&1 || { fail "repoint_marketplace exited non-zero on case 4"; }
if cmp -s "$T4/.claude/settings.json" "$T/case4-before.json"; then
    pass "leaves a settings.json with no rzem entry byte-identical"
else
    fail "a settings.json with no rzem entry was rewritten"
fi

# --- --dry-run changes nothing and names the repoint ---

T5="$T/case5-dry-run"
mkdir -p "$T5/.claude"
old_marketplace "$T5/.claude/settings.json"
cp "$T5/.claude/settings.json" "$T/case5-before.json"
out5=$(run_repoint "$T5" --dry-run 2>&1) || { fail "repoint_marketplace exited non-zero on case 5 (--dry-run)"; printf '%s\n' "$out5" >&2; }
if cmp -s "$T5/.claude/settings.json" "$T/case5-before.json"; then
    pass "--dry-run leaves settings.json byte-identical"
else
    fail "--dry-run rewrote settings.json"
fi
if grep -q 'would repoint' <<<"$out5"; then
    pass "--dry-run prints a 'would repoint' line"
else
    fail "--dry-run output is missing the 'would repoint' line (got: $out5)"
fi

# --- End to end: install-home.sh itself ---
#
# The environment the script reads for paths is cleared so nothing points at
# the real machine. A stub op that records any call sits first on PATH, so a
# run that still reached for 1Password would leave a trace.

STUB_BIN="$T/stub-bin"
mkdir -p "$STUB_BIN"
printf '#!/bin/sh\necho called >> "%s/op-called"\nexit 1\n' "$T" > "$STUB_BIN/op"
chmod 755 "$STUB_BIN/op"

run_install() {
    # $1 HOME, then any install-home.sh arguments
    local home="$1"; shift
    env -u CLAUDE_CONFIG_DIR -u CODER_FLEET_BACKUP_DIR -u XDG_STATE_HOME \
        HOME="$home" PATH="$STUB_BIN:$PATH" \
        bash "$INSTALL_SCRIPT" "$@"
}

T6="$T/case6-e2e-dry-run"
mkdir -p "$T6/.claude"
old_marketplace "$T6/.claude/settings.json"
out6=$(run_install "$T6" --dry-run 2>&1) || { fail "install-home.sh --dry-run exited non-zero on case 6"; printf '%s\n' "$out6" >&2; }
if grep -qx 'would repoint marketplace rzem to rzem-ai/coder-fleet' <<<"$out6"; then
    pass "the real --dry-run output says it would repoint the marketplace"
else
    fail "the real --dry-run output has no 'would repoint' line (got: $out6)"
fi
if grep -qx '  claude plugin install coder-fleet@rzem' <<<"$out6"; then
    pass "the real --dry-run output closes with 'claude plugin install coder-fleet@rzem'"
else
    fail "the real --dry-run output never prints 'claude plugin install coder-fleet@rzem' (got: $out6)"
fi

# --- A real run repoints, backs up the original, keeps the mode, and leaves
# both old credential directories and op alone ---

T10="$T/case10-real"
mkdir -p "$T10/.claude" "$T10/.config/claudecode-agents" "$T10/.config/coder-fleet"
old_marketplace "$T10/.claude/settings.json"
printf 'token|op://vault/item/field\n' > "$T10/.config/claudecode-agents/secrets.spec"
printf 'BOARD_COL_DONE=Shipped\n' > "$T10/.config/coder-fleet/board.env"
cp "$T10/.claude/settings.json" "$T/case10-before.json"
chmod 644 "$T10/.claude/settings.json"
out10=$(run_install "$T10" 2>&1) || { fail "install-home.sh exited non-zero on case 10"; printf '%s\n' "$out10" >&2; }
repo10=$(jq -r '.extraKnownMarketplaces.rzem.source.repo' "$T10/.claude/settings.json")
if [ "$repo10" = rzem-ai/coder-fleet ]; then
    pass "a real run repoints the marketplace"
else
    fail "a real run left the marketplace at '$repo10'"
fi
# The repoint is the first write to settings.json, so the backup must hold the
# file as it was before it, and the file keeps its mode.
bak10=$(find "$T10/.local/state/coder-fleet/backups" -name settings.json -type f 2>/dev/null | head -1)
if [ -n "$bak10" ] && cmp -s "$bak10" "$T/case10-before.json"; then
    pass "a real run backs up settings.json as it was before the repoint"
else
    fail "a real run left no backup of the original settings.json (found: '${bak10:-none}')"
fi
mode10=$(python3 -c 'import os,stat,sys; print(oct(stat.S_IMODE(os.stat(sys.argv[1]).st_mode)))' "$T10/.claude/settings.json")
if [ "$mode10" = 0o644 ]; then
    pass "the repoint keeps settings.json's mode"
else
    fail "the repoint changed settings.json's mode to $mode10"
fi
if [ -f "$T10/.config/claudecode-agents/secrets.spec" ] && [ -f "$T10/.config/coder-fleet/board.env" ]; then
    pass "a real run leaves ~/.config/claudecode-agents and ~/.config/coder-fleet alone"
else
    fail "a real run moved or removed a file under ~/.config"
fi
if [ ! -e "$T/op-called" ]; then
    pass "a real run never calls op"
else
    fail "a real run called op"
fi
if grep -q -i -e '1password' -e 'secret' -e 'board' <<<"$out10"; then
    fail "a real run still mentions secrets, 1Password or the board (got: $out10)"
else
    pass "a real run says nothing about secrets, 1Password or the board"
fi

if [ "$FAILED" -eq 0 ]; then
    printf 'install-home-migration: all assertions pass\n'
    exit 0
else
    printf 'install-home-migration: FAILED\n'
    exit 1
fi
