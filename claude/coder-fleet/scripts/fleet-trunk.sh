#!/usr/bin/env bash
#
# fleet-trunk.sh - print the trunk of the repository <dir> is in.
#
# The one resolver of the trunk, fleet_trunk in hooks/lib/fleet-config.sh,
# for a hook or script that would rather run a command than source the helper:
# `baseBranch` in the main checkout's .claude/coder-fleet.json when set; else
# the branch the remote's HEAD names, the remote being origin or the only one;
# else main.
#
# Exit 0 with the branch on stdout. Exit 1 with nothing on stdout and the
# reason on stderr when baseBranch is invalid or the file could not be read,
# so a caller never acts on a trunk the human did not name.
#
# Written for bash 3.2.
#
# Usage:  fleet-trunk.sh [dir]     dir defaults to CLAUDE_PROJECT_DIR, then $PWD

set -uo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../hooks/lib/fleet-config.sh
. "$PLUGIN_ROOT/hooks/lib/fleet-config.sh"

[ "$#" -le 1 ] || { printf 'usage: fleet-trunk.sh [dir]\n' >&2; exit 2; }
root="$(fleet_config_root "${1:-}")" || root=""
if fleet_trunk "$root"; then
    printf '%s\n' "$FLEET_TRUNK"
    exit 0
fi
printf 'fleet-trunk.sh: no trunk: %s\n' "$FLEET_TRUNK_REASON" >&2
exit 1
